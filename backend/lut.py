"""Color grade math shared by the .cube LUT exporter and preview renderer."""
from __future__ import annotations

import io
import re
from typing import Tuple

import numpy as np
from PIL import Image


def _sanitize(text: str) -> str:
    return re.sub(r"[^A-Za-z0-9._ -]+", "", text or "").strip() or "ChromaLens Grade"


def _params(analysis: dict) -> dict:
    lr = analysis.get("lightroom") or {}

    def f(k: str, default: float = 0.0) -> float:
        v = lr.get(k)
        try:
            return float(v) if v is not None else default
        except (TypeError, ValueError):
            return default

    return {
        "temperature": f("temperature", 5500.0),
        "tint": f("tint", 0.0),
        "exposure": f("exposure", 0.0),
        "contrast": f("contrast", 0.0),
        "highlights": f("highlights", 0.0),
        "shadows": f("shadows", 0.0),
        "whites": f("whites", 0.0),
        "blacks": f("blacks", 0.0),
        "saturation": f("saturation", 0.0),
        "vibrance": f("vibrance", 0.0),
    }


def apply_grade(r: np.ndarray, g: np.ndarray, b: np.ndarray, p: dict) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Apply the color grade to float32 RGB arrays in the [0, 1] range."""
    r = r.astype(np.float32, copy=True)
    g = g.astype(np.float32, copy=True)
    b = b.astype(np.float32, copy=True)

    # 1) Exposure (EV)
    gain = float(2.0 ** np.clip(p["exposure"], -5.0, 5.0))
    r *= gain
    g *= gain
    b *= gain

    # 2) White balance
    temp_shift = float(np.clip((p["temperature"] - 5500.0) / 5500.0, -1.5, 1.5)) * 0.18
    r *= (1.0 + temp_shift)
    b *= (1.0 - temp_shift)
    tint_shift = float(np.clip(p["tint"] / 150.0, -1.0, 1.0)) * 0.12
    g *= (1.0 - tint_shift)
    r *= (1.0 + tint_shift * 0.4)
    b *= (1.0 + tint_shift * 0.4)

    def tone(x: np.ndarray) -> np.ndarray:
        c = 1.0 + p["contrast"] / 100.0
        x = (x - 0.5) * c + 0.5
        h = p["highlights"] / 100.0
        x = x - h * 0.35 * np.clip(x - 0.5, 0.0, None) ** 1.4 * 2.0
        s = p["shadows"] / 100.0
        x = x + s * 0.35 * np.clip(0.5 - x, 0.0, None) ** 1.4 * 2.0
        w = p["whites"] / 100.0
        x = x + w * 0.15 * (x ** 2)
        bl = p["blacks"] / 100.0
        x = x + bl * 0.15 * ((1.0 - x) ** 2) * (x < 0.35)
        return x

    r = tone(r)
    g = tone(g)
    b = tone(b)

    # 3) Saturation
    luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
    sat = 1.0 + p["saturation"] / 100.0
    r = luma + (r - luma) * sat
    g = luma + (g - luma) * sat
    b = luma + (b - luma) * sat

    # 4) Vibrance
    if p["vibrance"] != 0.0:
        vib = p["vibrance"] / 200.0
        cur = np.maximum.reduce([r, g, b]) - np.minimum.reduce([r, g, b])
        weight = np.clip(1.0 - cur, 0.0, 1.0)
        r = luma + (r - luma) * (1.0 + vib * weight)
        g = luma + (g - luma) * (1.0 + vib * weight)
        b = luma + (b - luma) * (1.0 + vib * weight)

    return np.clip(r, 0.0, 1.0), np.clip(g, 0.0, 1.0), np.clip(b, 0.0, 1.0)


def build_cube_lut(analysis: dict, size: int = 33) -> Tuple[str, str]:
    """Return (cube_text, filename) for the given analysis."""
    title = _sanitize(analysis.get("title") or "ChromaLens Grade")
    params = _params(analysis)

    axis = np.linspace(0.0, 1.0, size, dtype=np.float32)
    R = np.tile(axis, size * size)
    G = np.tile(np.repeat(axis, size), size)
    B = np.repeat(axis, size * size)

    r, g, b = apply_grade(R, G, B, params)

    buf = io.StringIO()
    buf.write(f'TITLE "ChromaLens - {title}"\n')
    buf.write(f"LUT_3D_SIZE {size}\n")
    buf.write("DOMAIN_MIN 0.0 0.0 0.0\n")
    buf.write("DOMAIN_MAX 1.0 1.0 1.0\n")
    buf.write("\n")
    rows = np.stack([r, g, b], axis=-1)
    lines = "\n".join(f"{row[0]:.6f} {row[1]:.6f} {row[2]:.6f}" for row in rows)
    buf.write(lines)
    buf.write("\n")

    filename = re.sub(r"\s+", "_", title) + ".cube"
    return buf.getvalue(), filename


def render_graded_preview(image_bytes: bytes, analysis: dict, max_side: int = 1400) -> bytes:
    """Apply the grade to an image and return JPEG bytes (RGB, sRGB)."""
    im = Image.open(io.BytesIO(image_bytes))
    if im.mode != "RGB":
        im = im.convert("RGB")
    # Downscale huge images to keep the endpoint snappy
    if max(im.size) > max_side:
        im.thumbnail((max_side, max_side), Image.LANCZOS)

    arr = np.asarray(im, dtype=np.float32) / 255.0
    r = arr[..., 0]
    g = arr[..., 1]
    b = arr[..., 2]
    r, g, b = apply_grade(r, g, b, _params(analysis))
    out = np.stack([r, g, b], axis=-1)
    out = (out * 255.0 + 0.5).astype(np.uint8)

    out_im = Image.fromarray(out, "RGB")
    buf = io.BytesIO()
    out_im.save(buf, format="JPEG", quality=88, optimize=True)
    return buf.getvalue()
