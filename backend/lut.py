"""Color grade math shared by the .cube LUT exporter and preview renderer.

Supports full parameter set: exposure, white balance, tone curve
(contrast/highlights/shadows/whites/blacks), saturation, vibrance,
per-band HSL, vignette, and grain.
"""
from __future__ import annotations

import io
import re
from typing import Tuple

import numpy as np
from PIL import Image


HSL_BANDS = [
    ("red", 0.0),
    ("orange", 30.0),
    ("yellow", 60.0),
    ("green", 120.0),
    ("aqua", 180.0),
    ("blue", 240.0),
    ("purple", 270.0),
    ("magenta", 330.0),
]


def _sanitize(text: str) -> str:
    return re.sub(r"[^A-Za-z0-9._ -]+", "", text or "").strip() or "ChromaLens Grade"


def _params(analysis: dict) -> dict:
    lr = analysis.get("lightroom") or {}
    fx = analysis.get("effects") or {}

    def f(src, k, default=0.0):
        v = src.get(k) if isinstance(src, dict) else None
        try:
            return float(v) if v is not None else default
        except (TypeError, ValueError):
            return default

    hsl_in = lr.get("hsl") or {}
    hsl = {}
    for name, _hue in HSL_BANDS:
        entry = hsl_in.get(name) or {}
        hsl[name] = {
            "hue": f(entry, "hue"),
            "saturation": f(entry, "saturation"),
            "luminance": f(entry, "luminance"),
        }

    return {
        "temperature": f(lr, "temperature", 5500.0),
        "tint": f(lr, "tint"),
        "exposure": f(lr, "exposure"),
        "contrast": f(lr, "contrast"),
        "highlights": f(lr, "highlights"),
        "shadows": f(lr, "shadows"),
        "whites": f(lr, "whites"),
        "blacks": f(lr, "blacks"),
        "saturation": f(lr, "saturation"),
        "vibrance": f(lr, "vibrance"),
        "hsl": hsl,
        "vignette": f(fx, "vignette"),  # -100 (dark corners) .. 100 (bright)
        "grain": f(fx, "grain"),  # 0 .. 100
    }


def _rgb_to_hsl(r: np.ndarray, g: np.ndarray, b: np.ndarray):
    mx = np.maximum(np.maximum(r, g), b)
    mn = np.minimum(np.minimum(r, g), b)
    c = mx - mn
    l = (mx + mn) / 2.0

    # Hue
    h = np.zeros_like(r)
    mask = c > 1e-6
    rc = np.where(mask, (mx - r) / np.where(mask, c, 1.0), 0.0)
    gc = np.where(mask, (mx - g) / np.where(mask, c, 1.0), 0.0)
    bc = np.where(mask, (mx - b) / np.where(mask, c, 1.0), 0.0)
    h_r = bc - gc
    h_g = 2.0 + rc - bc
    h_b = 4.0 + gc - rc
    h = np.where(mx == r, h_r, np.where(mx == g, h_g, h_b))
    h = (h * 60.0) % 360.0
    h = np.where(mask, h, 0.0)

    # Saturation
    s = np.where(l < 0.5, np.where(mask, c / (mx + mn + 1e-9), 0.0),
                 np.where(mask, c / (2.0 - mx - mn + 1e-9), 0.0))
    return h, s, l


def _hsl_to_rgb(h: np.ndarray, s: np.ndarray, l: np.ndarray):
    def hue2rgb(p, q, t):
        t = t % 1.0
        return np.where(t < 1 / 6, p + (q - p) * 6 * t,
               np.where(t < 1 / 2, q,
               np.where(t < 2 / 3, p + (q - p) * (2 / 3 - t) * 6, p)))

    h_n = h / 360.0
    q = np.where(l < 0.5, l * (1.0 + s), l + s - l * s)
    p = 2.0 * l - q
    r = hue2rgb(p, q, h_n + 1 / 3)
    g = hue2rgb(p, q, h_n)
    b = hue2rgb(p, q, h_n - 1 / 3)
    # Where s==0 (grey), r=g=b=l
    grey = s < 1e-6
    r = np.where(grey, l, r)
    g = np.where(grey, l, g)
    b = np.where(grey, l, b)
    return r, g, b


def _band_weight(hue_deg: np.ndarray, center: float, sigma: float = 30.0) -> np.ndarray:
    """Gaussian weight for a hue band. Handles wraparound."""
    d = np.abs(hue_deg - center)
    d = np.minimum(d, 360.0 - d)
    return np.exp(-(d ** 2) / (2.0 * sigma * sigma))


def apply_grade(r: np.ndarray, g: np.ndarray, b: np.ndarray, p: dict,
                shape: tuple | None = None) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Apply the color grade to float32 RGB arrays in the [0, 1] range.

    `shape` is (H, W) needed for vignette + grain. If None, those effects are skipped.
    """
    r = r.astype(np.float32, copy=True)
    g = g.astype(np.float32, copy=True)
    b = b.astype(np.float32, copy=True)

    # 1) Exposure
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

    # 3) Tone curve
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

    # 4) Global saturation
    luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
    sat = 1.0 + p["saturation"] / 100.0
    r = luma + (r - luma) * sat
    g = luma + (g - luma) * sat
    b = luma + (b - luma) * sat

    # 5) Vibrance
    if p["vibrance"] != 0.0:
        vib = p["vibrance"] / 200.0
        cur = np.maximum.reduce([r, g, b]) - np.minimum.reduce([r, g, b])
        weight = np.clip(1.0 - cur, 0.0, 1.0)
        r = luma + (r - luma) * (1.0 + vib * weight)
        g = luma + (g - luma) * (1.0 + vib * weight)
        b = luma + (b - luma) * (1.0 + vib * weight)

    # 6) HSL per-band adjustments
    hsl_params = p.get("hsl") or {}
    has_hsl = any(
        (hsl_params.get(k, {}).get("hue", 0) or hsl_params.get(k, {}).get("saturation", 0) or hsl_params.get(k, {}).get("luminance", 0))
        for k, _ in HSL_BANDS
    )
    if has_hsl:
        r_c = np.clip(r, 0.0, 1.0)
        g_c = np.clip(g, 0.0, 1.0)
        b_c = np.clip(b, 0.0, 1.0)
        h, s_val, l_val = _rgb_to_hsl(r_c, g_c, b_c)
        dh_total = np.zeros_like(h)
        ds_total = np.zeros_like(h)
        dl_total = np.zeros_like(h)
        for name, center in HSL_BANDS:
            band = hsl_params.get(name, {})
            hue_shift = float(band.get("hue", 0.0))
            sat_shift = float(band.get("saturation", 0.0))
            lum_shift = float(band.get("luminance", 0.0))
            if hue_shift == 0.0 and sat_shift == 0.0 and lum_shift == 0.0:
                continue
            w = _band_weight(h, center)
            dh_total = dh_total + w * (hue_shift * 0.6)  # up to +/-60deg
            ds_total = ds_total + w * (sat_shift / 100.0)
            dl_total = dl_total + w * (lum_shift / 200.0)  # gentle
        h_new = (h + dh_total) % 360.0
        s_new = np.clip(s_val * (1.0 + ds_total), 0.0, 1.0)
        l_new = np.clip(l_val + dl_total, 0.0, 1.0)
        r, g, b = _hsl_to_rgb(h_new, s_new, l_new)

    # 7) Vignette
    if shape is not None and p.get("vignette", 0.0) != 0.0:
        h_px, w_px = shape
        strength = float(np.clip(p["vignette"], -100.0, 100.0)) / 100.0
        yy, xx = np.mgrid[0:h_px, 0:w_px].astype(np.float32)
        cy = h_px / 2.0
        cx = w_px / 2.0
        max_d = np.sqrt(cy * cy + cx * cx)
        d = np.sqrt((yy - cy) ** 2 + (xx - cx) ** 2) / max_d  # 0..~1.4
        mask = np.clip((d - 0.3) / 0.7, 0.0, 1.0) ** 2
        mask = mask.reshape(-1)  # if r is flat
        factor = 1.0 - strength * mask  # <1 darkens, >1 lightens
        # If r is a flat array (LUT identity), skip; only apply for images
        if r.ndim == 1 and r.size == mask.size:
            r = r * factor
            g = g * factor
            b = b * factor

    # 8) Grain
    if shape is not None and p.get("grain", 0.0) > 0.0:
        amt = float(np.clip(p["grain"], 0.0, 100.0)) / 100.0 * 0.10
        rng = np.random.default_rng(42)
        noise = rng.standard_normal(size=r.size).astype(np.float32) * amt
        r = r + noise
        g = g + noise
        b = b + noise

    return np.clip(r, 0.0, 1.0), np.clip(g, 0.0, 1.0), np.clip(b, 0.0, 1.0)


def build_cube_lut(analysis: dict, size: int = 33) -> Tuple[str, str]:
    """Build a .cube LUT. Vignette + grain are skipped (spatial only)."""
    title = _sanitize(analysis.get("title") or "ChromaLens Grade")
    params = _params(analysis)
    # Zero out spatial effects for LUT
    params["vignette"] = 0.0
    params["grain"] = 0.0

    axis = np.linspace(0.0, 1.0, size, dtype=np.float32)
    R = np.tile(axis, size * size)
    G = np.tile(np.repeat(axis, size), size)
    B = np.repeat(axis, size * size)

    r, g, b = apply_grade(R, G, B, params, shape=None)

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


def render_graded_image(image_bytes: bytes, analysis: dict,
                        max_side: int | None = 1400, jpeg_quality: int = 88) -> bytes:
    """Apply the grade to an image and return JPEG bytes."""
    im = Image.open(io.BytesIO(image_bytes))
    if im.mode != "RGB":
        im = im.convert("RGB")
    if max_side is not None and max(im.size) > max_side:
        im.thumbnail((max_side, max_side), Image.LANCZOS)

    arr = np.asarray(im, dtype=np.float32) / 255.0
    h_px, w_px = arr.shape[:2]
    r = arr[..., 0].ravel()
    g = arr[..., 1].ravel()
    b = arr[..., 2].ravel()
    r, g, b = apply_grade(r, g, b, _params(analysis), shape=(h_px, w_px))
    out = np.stack([r.reshape(h_px, w_px), g.reshape(h_px, w_px), b.reshape(h_px, w_px)], axis=-1)
    out = (out * 255.0 + 0.5).astype(np.uint8)

    out_im = Image.fromarray(out, "RGB")
    buf = io.BytesIO()
    out_im.save(buf, format="JPEG", quality=jpeg_quality, optimize=True)
    return buf.getvalue()


# Backwards-compatible alias used by /api/preview endpoint
def render_graded_preview(image_bytes: bytes, analysis: dict, max_side: int = 1400) -> bytes:
    return render_graded_image(image_bytes, analysis, max_side=max_side)
