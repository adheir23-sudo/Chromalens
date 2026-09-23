"""3D .cube LUT generator from a ChromaLens analysis dict.

Applies (in order) exposure, white balance, tone curve
(contrast/highlights/shadows/whites/blacks), saturation and vibrance to a
uniform RGB grid, then serialises to the Adobe .cube 3D LUT format that
DaVinci Resolve, Premiere, and CapCut all accept.
"""
from __future__ import annotations

import io
import re
import numpy as np


def _sanitize(text: str) -> str:
    return re.sub(r"[^A-Za-z0-9._ -]+", "", text or "").strip() or "ChromaLens Grade"


def build_cube_lut(analysis: dict, size: int = 33) -> tuple[str, str]:
    """Return (cube_text, filename) for the given analysis."""
    lr = analysis.get("lightroom") or {}
    title = _sanitize(analysis.get("title") or "ChromaLens Grade")

    def f(k: str, default: float = 0.0) -> float:
        v = lr.get(k)
        try:
            return float(v) if v is not None else default
        except (TypeError, ValueError):
            return default

    temp = f("temperature", 5500.0)
    tint = f("tint", 0.0)
    exposure = f("exposure", 0.0)
    contrast = f("contrast", 0.0)
    highlights = f("highlights", 0.0)
    shadows = f("shadows", 0.0)
    whites = f("whites", 0.0)
    blacks = f("blacks", 0.0)
    saturation = f("saturation", 0.0)
    vibrance = f("vibrance", 0.0)

    axis = np.linspace(0.0, 1.0, size, dtype=np.float32)
    # In .cube format, R varies fastest, then G, then B.
    R = np.tile(axis, size * size)
    G = np.tile(np.repeat(axis, size), size)
    B = np.repeat(axis, size * size)
    r = R.copy()
    g = G.copy()
    b = B.copy()

    # 1) Exposure (EV)
    gain = float(2.0 ** np.clip(exposure, -5.0, 5.0))
    r *= gain
    g *= gain
    b *= gain

    # 2) White balance: temperature (R vs B) and tint (magenta vs green on G)
    temp_shift = float(np.clip((temp - 5500.0) / 5500.0, -1.5, 1.5)) * 0.18
    r *= (1.0 + temp_shift)
    b *= (1.0 - temp_shift)
    tint_shift = float(np.clip(tint / 150.0, -1.0, 1.0)) * 0.12
    g *= (1.0 - tint_shift)
    r *= (1.0 + tint_shift * 0.4)
    b *= (1.0 + tint_shift * 0.4)

    def tone(x: np.ndarray) -> np.ndarray:
        # Contrast S-curve around 0.5
        c = 1.0 + contrast / 100.0
        x = (x - 0.5) * c + 0.5
        # Highlights (roll off top when positive means "recover")
        h = highlights / 100.0
        x = x - h * 0.35 * np.clip(x - 0.5, 0.0, None) ** 1.4 * 2.0
        # Shadows (positive lifts)
        s = shadows / 100.0
        x = x + s * 0.35 * np.clip(0.5 - x, 0.0, None) ** 1.4 * 2.0
        # Whites (adjust white point)
        w = whites / 100.0
        x = x + w * 0.15 * (x ** 2)
        # Blacks (adjust black point)
        bl = blacks / 100.0
        x = x + bl * 0.15 * ((1.0 - x) ** 2) * (x < 0.35)
        return x

    r = tone(r)
    g = tone(g)
    b = tone(b)

    # 3) Saturation
    luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
    sat = 1.0 + saturation / 100.0
    r = luma + (r - luma) * sat
    g = luma + (g - luma) * sat
    b = luma + (b - luma) * sat

    # 4) Vibrance (protects already-saturated colors)
    if vibrance != 0.0:
        vib = vibrance / 200.0
        cur = np.maximum.reduce([r, g, b]) - np.minimum.reduce([r, g, b])
        weight = np.clip(1.0 - cur, 0.0, 1.0)
        r = luma + (r - luma) * (1.0 + vib * weight)
        g = luma + (g - luma) * (1.0 + vib * weight)
        b = luma + (b - luma) * (1.0 + vib * weight)

    r = np.clip(r, 0.0, 1.0)
    g = np.clip(g, 0.0, 1.0)
    b = np.clip(b, 0.0, 1.0)

    buf = io.StringIO()
    buf.write(f'TITLE "ChromaLens - {title}"\n')
    buf.write(f"LUT_3D_SIZE {size}\n")
    buf.write("DOMAIN_MIN 0.0 0.0 0.0\n")
    buf.write("DOMAIN_MAX 1.0 1.0 1.0\n")
    buf.write("\n")
    # Vectorised formatting is faster than per-row Python
    rows = np.stack([r, g, b], axis=-1)
    lines = "\n".join(f"{row[0]:.6f} {row[1]:.6f} {row[2]:.6f}" for row in rows)
    buf.write(lines)
    buf.write("\n")

    filename = re.sub(r"\s+", "_", title) + ".cube"
    return buf.getvalue(), filename
