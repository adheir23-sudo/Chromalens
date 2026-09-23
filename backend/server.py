"""ChromaLens AI - FastAPI backend."""
import os
import uuid
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, APIRouter, UploadFile, File, HTTPException, Query, Response
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pydantic import BaseModel, Field

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

from storage import init_storage, put_object, get_object  # noqa: E402
from analyzer import analyze_media  # noqa: E402

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


# ---- Mount ------------------------------------------------------------------
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)
