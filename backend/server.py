"""ChromaLens AI - FastAPI backend."""
import io
import os
import re
import uuid
import json
import shutil
import subprocess
import tempfile
import zipfile
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional

from fastapi import FastAPI, APIRouter, UploadFile, File, Form, HTTPException, Query, Response
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pydantic import BaseModel, Field

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

from storage import init_storage, put_object, get_object  # noqa: E402
from analyzer import analyze_media  # noqa: E402
from lut import build_cube_lut, render_graded_preview, render_graded_image  # noqa: E402
import ai_assist  # noqa: E402

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# ---- Mongo ------------------------------------------------------------------
mongo_url = os.environ["MONGO_URL"]
mongo_client = AsyncIOMotorClient(mongo_url)
db = mongo_client[os.environ["DB_NAME"]]

APP_NAME = os.environ.get("APP_NAME", "chromalens")

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
ALLOWED_VIDEO_TYPES = {"video/mp4", "video/quicktime", "video/mov"}


# ---- Models -----------------------------------------------------------------
class AnalysisRecord(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    storage_path: str
    original_filename: str
    content_type: str
    media_type: str  # "image" | "video"
    size: int
    analysis: dict
    is_deleted: bool = False
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


# ---- App --------------------------------------------------------------------
app = FastAPI(title="ChromaLens AI")
api_router = APIRouter(prefix="/api")


@app.on_event("startup")
async def _startup():
    try:
        init_storage()
        logger.info("Object storage initialized")
    except Exception as e:
        logger.error(f"Storage init failed: {e}")


@app.on_event("shutdown")
async def _shutdown():
    mongo_client.close()


@api_router.get("/")
async def root():
    return {"service": "chromalens", "status": "ok"}


# ---- Analyze ----------------------------------------------------------------
@api_router.post("/analyze")
async def analyze_endpoint(file: UploadFile = File(...)):
    content_type = (file.content_type or "").lower()
    is_image = content_type in ALLOWED_IMAGE_TYPES
    is_video = content_type in ALLOWED_VIDEO_TYPES

    if not (is_image or is_video):
        # try by extension fallback
        ext = (file.filename or "").lower().rsplit(".", 1)[-1]
        ext_map_img = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "webp": "image/webp"}
        ext_map_vid = {"mp4": "video/mp4", "mov": "video/quicktime"}
        if ext in ext_map_img:
            content_type = ext_map_img[ext]
            is_image = True
        elif ext in ext_map_vid:
            content_type = ext_map_vid[ext]
            is_video = True
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported file type: {file.content_type}")

    data = await file.read()
    if len(data) == 0:
        raise HTTPException(status_code=400, detail="Empty file")

    # Basic size caps: 15MB image, 40MB video
    max_size = 40 * 1024 * 1024 if is_video else 15 * 1024 * 1024
    if len(data) > max_size:
        raise HTTPException(
            status_code=413,
            detail=f"File exceeds max size ({max_size // (1024*1024)}MB)",
        )

    # 1) Run AI analysis first (fail fast)
    try:
        analysis = await analyze_media(data, content_type, is_video=is_video)
    except Exception as e:
        logger.exception("Analysis failed")
        raise HTTPException(status_code=502, detail=f"AI analysis failed: {e}") from e

    # 2) Store the file in object storage
    ext = (file.filename or "").rsplit(".", 1)[-1] or ("mp4" if is_video else "jpg")
    file_id = str(uuid.uuid4())
    storage_path = f"{APP_NAME}/uploads/public/{file_id}.{ext}"
    try:
        put_result = put_object(storage_path, data, content_type)
        storage_path = put_result["path"]
    except Exception as e:
        logger.exception("Storage upload failed")
        raise HTTPException(status_code=502, detail=f"Storage upload failed: {e}") from e

    # 3) Save the record
    record = AnalysisRecord(
        id=file_id,
        storage_path=storage_path,
        original_filename=file.filename or f"{file_id}.{ext}",
        content_type=content_type,
        media_type="video" if is_video else "image",
        size=len(data),
        analysis=analysis,
    )
    await db.analyses.insert_one(record.model_dump())

    return record.model_dump()


# ---- Gallery ----------------------------------------------------------------
@api_router.get("/gallery")
async def gallery_endpoint(
    limit: int = Query(50, ge=1, le=100),
    skip: int = Query(0, ge=0),
    media_type: Optional[str] = Query(None),
):
    query: dict = {"is_deleted": False}
    if media_type in {"image", "video"}:
        query["media_type"] = media_type

    cursor = (
        db.analyses.find(query, {"_id": 0})
        .sort("created_at", -1)
        .skip(skip)
        .limit(limit)
    )
    items = await cursor.to_list(length=limit)
    return {"items": items, "count": len(items)}


@api_router.get("/analyses/{analysis_id}")
async def get_analysis(analysis_id: str):
    record = await db.analyses.find_one(
        {"id": analysis_id, "is_deleted": False}, {"_id": 0}
    )
    if not record:
        raise HTTPException(status_code=404, detail="Analysis not found")
    return record


# ---- File proxy -------------------------------------------------------------
@api_router.get("/files/{analysis_id}")
async def file_endpoint(analysis_id: str):
    record = await db.analyses.find_one(
        {"id": analysis_id, "is_deleted": False}, {"_id": 0}
    )
    if not record:
        raise HTTPException(status_code=404, detail="Not found")
    try:
        data, ct = get_object(record["storage_path"])
    except Exception as e:
        logger.exception("Storage get failed")
        raise HTTPException(status_code=502, detail=f"Storage read failed: {e}") from e
    return Response(
        content=data,
        media_type=record.get("content_type") or ct,
        headers={"Cache-Control": "public, max-age=86400"},
    )


# ---- LUT export -------------------------------------------------------------
@api_router.get("/luts/{analysis_id}.cube")
async def lut_endpoint(analysis_id: str, size: int = Query(33, ge=17, le=65)):
    record = await db.analyses.find_one(
        {"id": analysis_id, "is_deleted": False}, {"_id": 0}
    )
    if not record:
        raise HTTPException(status_code=404, detail="Analysis not found")
    try:
        cube_text, filename = build_cube_lut(record.get("analysis") or {}, size=size)
    except Exception as e:
        logger.exception("LUT generation failed")
        raise HTTPException(status_code=500, detail=f"LUT generation failed: {e}") from e
    return Response(
        content=cube_text,
        media_type="application/x-cube",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "public, max-age=3600",
        },
    )


# ---- Graded preview ---------------------------------------------------------
_preview_cache: dict[str, bytes] = {}


@api_router.get("/preview/{analysis_id}")
async def preview_endpoint(analysis_id: str):
    record = await db.analyses.find_one(
        {"id": analysis_id, "is_deleted": False}, {"_id": 0}
    )
    if not record:
        raise HTTPException(status_code=404, detail="Analysis not found")
    if record.get("media_type") != "image":
        raise HTTPException(status_code=415, detail="Preview is available for images only")

    cached = _preview_cache.get(analysis_id)
    if cached is None:
        try:
            src_bytes, _ = get_object(record["storage_path"])
            cached = render_graded_preview(src_bytes, record.get("analysis") or {})
        except Exception as e:
            logger.exception("Preview render failed")
            raise HTTPException(status_code=500, detail=f"Preview render failed: {e}") from e
        # simple LRU-ish cap
        if len(_preview_cache) > 128:
            _preview_cache.pop(next(iter(_preview_cache)))
        _preview_cache[analysis_id] = cached

    return Response(
        content=cached,
        media_type="image/jpeg",
        headers={"Cache-Control": "public, max-age=86400"},
    )


# ---- Editor: photo export ---------------------------------------------------
def _params_to_analysis(params: dict) -> dict:
    """Wrap frontend editor params in the shape expected by lut.py."""
    lr_keys = {
        "temperature", "tint", "exposure", "contrast", "highlights", "shadows",
        "whites", "blacks", "saturation", "vibrance",
    }
    lightroom = {k: params[k] for k in lr_keys if k in params}
    if "hsl" in params:
        lightroom["hsl"] = params["hsl"]
    if "split_toning" in params:
        lightroom["split_toning"] = params["split_toning"]
    effects = {}
    if "vignette" in params:
        effects["vignette"] = params["vignette"]
    if "grain" in params:
        effects["grain"] = params["grain"]
    return {"lightroom": lightroom, "effects": effects}


@api_router.post("/edit/photo")
async def edit_photo(
    file: UploadFile = File(...),
    params: str = Form(...),
    max_side: int = Form(2400),
):
    try:
        params_dict = json.loads(params)
    except Exception:
        raise HTTPException(status_code=400, detail="params must be valid JSON")
    ct = (file.content_type or "").lower()
    ext = (file.filename or "").lower().rsplit(".", 1)[-1]
    if ct not in {"image/jpeg", "image/png", "image/webp"} and ext not in {"jpg", "jpeg", "png", "webp"}:
        raise HTTPException(status_code=400, detail="Only JPEG/PNG/WEBP images are supported")
    data = await file.read()
    if len(data) > 25 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Image too large (max 25 MB)")
    try:
        out = render_graded_image(data, _params_to_analysis(params_dict), max_side=max_side, jpeg_quality=92)
    except Exception as e:
        logger.exception("Photo edit failed")
        raise HTTPException(status_code=500, detail=f"Photo edit failed: {e}") from e
    stem = (file.filename or "edit").rsplit(".", 1)[0] or "edit"
    return Response(
        content=out,
        media_type="image/jpeg",
        headers={"Content-Disposition": f'attachment; filename="{stem}_chromalens.jpg"'},
    )


# ---- Editor: batch photo export --------------------------------------------
_BATCH_ALLOWED = {"image/jpeg", "image/png", "image/webp"}


@api_router.post("/edit/batch")
async def edit_batch(
    files: List[UploadFile] = File(...),
    params: str = Form(...),
    max_side: int = Form(2400),
):
    if not files:
        raise HTTPException(status_code=400, detail="No files provided")
    if len(files) > 30:
        raise HTTPException(status_code=413, detail="Max 30 files per batch")
    try:
        params_dict = json.loads(params)
    except Exception:
        raise HTTPException(status_code=400, detail="params must be valid JSON")

    analysis = _params_to_analysis(params_dict)
    total = 0
    zip_buf = io.BytesIO()
    manifest = ["ChromaLens Batch Export", f"Files: {len(files)}", ""]

    with zipfile.ZipFile(zip_buf, "w", zipfile.ZIP_STORED) as zf:
        for i, up in enumerate(files, start=1):
            ct = (up.content_type or "").lower()
            ext = (up.filename or "").lower().rsplit(".", 1)[-1]
            if ct not in _BATCH_ALLOWED and ext not in {"jpg", "jpeg", "png", "webp"}:
                continue
            data = await up.read()
            if not data or len(data) > 15 * 1024 * 1024:
                continue
            try:
                out = render_graded_image(data, analysis, max_side=max_side, jpeg_quality=90)
            except Exception as e:
                logger.warning("Batch item %s failed: %s", up.filename, e)
                continue
            stem = re.sub(r"[^A-Za-z0-9._-]+", "_", (up.filename or f"photo_{i}").rsplit(".", 1)[0]) or f"photo_{i}"
            entry = f"{i:02d}_{stem}_chromalens.jpg"
            zf.writestr(entry, out)
            manifest.append(entry)
            total += 1
        zf.writestr("manifest.txt", "\n".join(manifest))

    if total == 0:
        raise HTTPException(status_code=400, detail="No files could be processed")

    zip_bytes = zip_buf.getvalue()
    fname = f"chromalens_batch_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}.zip"
    return Response(
        content=zip_bytes,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


# ---- Editor: video export (ffmpeg + .cube LUT) ------------------------------
@api_router.post("/edit/video")
async def edit_video(
    file: UploadFile = File(...),
    params: str = Form(...),
):
    if shutil.which("ffmpeg") is None:
        raise HTTPException(status_code=503, detail="ffmpeg is not installed on the server")
    try:
        params_dict = json.loads(params)
    except Exception:
        raise HTTPException(status_code=400, detail="params must be valid JSON")

    ct = (file.content_type or "").lower()
    ext = (file.filename or "").lower().rsplit(".", 1)[-1]
    if ct not in {"video/mp4", "video/quicktime", "video/mov"} and ext not in {"mp4", "mov"}:
        raise HTTPException(status_code=400, detail="Only MP4 or MOV videos are supported")

    data = await file.read()
    if len(data) > 80 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Video too large (max 80 MB)")

    tmp_dir = tempfile.mkdtemp(prefix="chromalens_vid_")
    try:
        in_path = os.path.join(tmp_dir, f"in.{ext or 'mp4'}")
        out_path = os.path.join(tmp_dir, "out.mp4")
        lut_path = os.path.join(tmp_dir, "grade.cube")

        with open(in_path, "wb") as fh:
            fh.write(data)

        cube_text, _ = build_cube_lut(_params_to_analysis(params_dict), size=33)
        with open(lut_path, "w") as fh:
            fh.write(cube_text)

        # Escape colons in lut3d filter path (ffmpeg quirk)
        lut_esc = lut_path.replace(":", "\\:")
        cmd = [
            "ffmpeg", "-y",
            "-i", in_path,
            "-vf", f"lut3d={lut_esc}",
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
            "-c:a", "copy",
            "-movflags", "+faststart",
            out_path,
        ]
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        if proc.returncode != 0:
            logger.error("ffmpeg failed: %s", proc.stderr[-800:])
            raise HTTPException(status_code=500, detail="Video processing failed")

        with open(out_path, "rb") as fh:
            out_bytes = fh.read()

        stem = (file.filename or "edit").rsplit(".", 1)[0] or "edit"
        return Response(
            content=out_bytes,
            media_type="video/mp4",
            headers={"Content-Disposition": f'attachment; filename="{stem}_chromalens.mp4"'},
        )
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


# ---- AI Assist --------------------------------------------------------------
@api_router.get("/ai/moods")
async def ai_moods():
    return {"moods": ai_assist.list_moods()}


@api_router.post("/ai/assist")
async def ai_assist_endpoint(
    mode: str = Form(...),
    mood_id: Optional[str] = Form(None),
    scene: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
):
    """
    mode = 'enhance' | 'match' | 'mood'
      - 'enhance': needs file (image)
      - 'match':   needs file (reference image)
      - 'mood':    needs mood_id (optionally file for scene context or scene text)
    """
    mode = (mode or "").lower().strip()
    try:
        if mode == "enhance":
            if file is None:
                raise HTTPException(status_code=400, detail="Image file is required for enhance mode")
            data = await file.read()
            if not data or len(data) > 15 * 1024 * 1024:
                raise HTTPException(status_code=400, detail="Image missing or too large (max 15 MB)")
            grade = await ai_assist.enhance(data)
        elif mode == "match":
            if file is None:
                raise HTTPException(status_code=400, detail="Reference image is required for match mode")
            data = await file.read()
            if not data or len(data) > 15 * 1024 * 1024:
                raise HTTPException(status_code=400, detail="Image missing or too large (max 15 MB)")
            grade = await ai_assist.match_reference(data)
        elif mode == "mood":
            if not mood_id:
                raise HTTPException(status_code=400, detail="mood_id is required for mood mode")
            grade = await ai_assist.mood_grade(mood_id, scene or "")
        else:
            raise HTTPException(status_code=400, detail=f"Unknown mode: {mode}")
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("AI assist failed")
        raise HTTPException(status_code=502, detail=f"AI assist failed: {e}") from e

    return {"grade": grade}


# ---- Mount ------------------------------------------------------------------
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)
