"""Gemini 3.1 Pro powered image / video analysis for ChromaLens."""
import os
import json
import re
import tempfile
import uuid
import logging
from emergentintegrations.llm.chat import (
    LlmChat,
    UserMessage,
    ImageContent,
    FileContentWithMimeType,
)

logger = logging.getLogger(__name__)

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY")
MODEL_PROVIDER = "gemini"
MODEL_NAME = "gemini-3.1-pro-preview"

SYSTEM_PROMPT = """You are ChromaLens AI — an expert cinematographer, colorist, and photography metadata analyst.

You will be shown an image or a short video clip. Your job is to output a single JSON object that describes:
1. The technical shooting details (camera device, lens, resolution, megapixels, bit depth, editing/software used, ISO, aperture, shutter, focal length, FPS if video).
2. The color grading formula a colorist would use to recreate this look in Adobe Lightroom AND DaVinci Resolve.
3. A short human-readable description of the mood, tone, and lighting.

VERY IMPORTANT:
- If a field cannot be confidently inferred from the visual content, make a well-reasoned professional estimate rather than saying "unknown". Cinematographers and photographers can usually guess camera family, bit depth, and software from the look. Be decisive.
- Always output valid JSON matching the schema below. No markdown, no commentary, no code fences.

JSON SCHEMA:
{
  "title": "short evocative title for this shot (max 5 words)",
  "media_type": "image" | "video",
  "technical": {
    "device": "Camera body, e.g. Sony A7 IV, iPhone 15 Pro, RED V-Raptor 8K",
    "lens": "Lens description, e.g. FE 24-70mm f/2.8 GM",
    "resolution": "e.g. 3840 x 2160",
    "megapixels": "e.g. 33.0 MP",
    "bit_depth": "e.g. 10-bit 4:2:2 / 14-bit RAW",
    "iso": "e.g. ISO 400",
    "aperture": "e.g. f/2.8",
    "shutter": "e.g. 1/250s",
    "focal_length": "e.g. 50mm",
    "fps": "e.g. 24 fps (or 'n/a' for still images)",
    "software": "Likely editing software, e.g. DaVinci Resolve 19, Adobe Lightroom Classic, Capture One 23"
  },
  "mood": {
    "title": "e.g. Moody & Cool Teal / Warm Vintage Film Emulation",
    "description": "2-3 sentence natural-language description of atmosphere, contrast curve, and lighting"
  },
  "palette": [
    {"hex": "#RRGGBB", "name": "descriptive name"}
  ],
  "lightroom": {
    "temperature": 5500,
    "tint": 0,
    "exposure": 0.0,
    "contrast": 0,
    "highlights": 0,
    "shadows": 0,
    "whites": 0,
    "blacks": 0,
    "texture": 0,
    "clarity": 0,
    "dehaze": 0,
    "vibrance": 0,
    "saturation": 0,
    "hsl": {
      "red":     {"hue": 0, "saturation": 0, "luminance": 0},
      "orange":  {"hue": 0, "saturation": 0, "luminance": 0},
      "yellow":  {"hue": 0, "saturation": 0, "luminance": 0},
      "green":   {"hue": 0, "saturation": 0, "luminance": 0},
      "aqua":    {"hue": 0, "saturation": 0, "luminance": 0},
      "blue":    {"hue": 0, "saturation": 0, "luminance": 0},
      "purple":  {"hue": 0, "saturation": 0, "luminance": 0},
      "magenta": {"hue": 0, "saturation": 0, "luminance": 0}
    }
  },
  "davinci": {
    "lift":      {"r": 0.0, "g": 0.0, "b": 0.0, "y": 0.0},
    "gamma":     {"r": 0.0, "g": 0.0, "b": 0.0, "y": 0.0},
    "gain":      {"r": 0.0, "g": 0.0, "b": 0.0, "y": 0.0},
    "offset":    {"r": 0.0, "g": 0.0, "b": 0.0, "y": 0.0},
    "saturation": 1.0,
    "contrast": 1.0,
    "pivot": 0.435,
    "notes": "one-line colorist notes about node order (e.g. 'Serial: Balance -> Print Film Emulation -> Halation -> Grain 8mm')"
  },
  "capcut": {
    "brightness": 0,
    "contrast": 0,
    "saturation": 0,
    "sharpen": 0,
    "highlights": 0,
    "shadows": 0,
    "whites": 0,
    "blacks": 0,
    "temperature": 0,
    "tint": 0,
    "hue": 0,
    "fade": 0,
    "vignette": 0,
    "grain": 0,
    "filter_suggestion": "Suggested CapCut built-in filter that gets closest, e.g. 'Movie / Bronze' or 'Aesthetic / Vintage Film' at 60% strength",
    "notes": "one-line workflow tip, e.g. 'Apply Adjust -> Filter (Movie/Bronze @ 60) -> Effects (Light Leak) for authentic film look'"
  }
}

Ranges:
- Lightroom Temperature: 2000-50000 (Kelvin). Tint: -150 to +150. Exposure: -5.0 to +5.0. Contrast/Highlights/Shadows/Whites/Blacks/Texture/Clarity/Dehaze/Vibrance/Saturation: -100 to +100.
- Lightroom HSL Hue/Saturation/Luminance: -100 to +100 for each per color.
- DaVinci Resolve lift/gamma/gain/offset per RGBY channel: -1.0 to +1.0.
- DaVinci Resolve saturation & contrast around 1.0 (0.0 - 2.0 typical).
- CapCut Brightness/Contrast/Saturation/Highlights/Shadows/Whites/Blacks/Temperature/Tint/Hue: -100 to +100. Sharpen/Fade/Vignette/Grain: 0 to +100.

Return ONLY the JSON object.
"""


def _extract_json(text: str) -> dict:
    """Pull the first JSON object out of a text blob."""
    if not text:
        raise ValueError("Empty response from model")
    text = text.strip()
    # Strip ``` fences if present
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    # Find first {...} block
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if not match:
        raise ValueError(f"No JSON object found in model response: {text[:200]}")
    return json.loads(match.group(0))


async def analyze_media(
    file_bytes: bytes,
    content_type: str,
    is_video: bool,
) -> dict:
    """Send bytes to Gemini 3.1 Pro and return parsed analysis."""
    session_id = f"chromalens-{uuid.uuid4()}"

    chat = (
        LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=session_id,
            system_message=SYSTEM_PROMPT,
        )
        .with_model(MODEL_PROVIDER, MODEL_NAME)
    )

    if is_video:
        # Videos MUST go via FileContentWithMimeType (Gemini only path)
        suffix = ".mp4" if "mp4" in content_type else ".mov"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tf:
            tf.write(file_bytes)
            tmp_path = tf.name
        try:
            file_content = FileContentWithMimeType(
                file_path=tmp_path, mime_type=content_type or "video/mp4"
            )
            user_msg = UserMessage(
                text="Analyze this video clip and output the JSON per your system schema. No preamble.",
                file_contents=[file_content],
            )
            response = await chat.send_message(user_msg)
        finally:
            try:
                os.unlink(tmp_path)
            except Exception:
                pass
    else:
        import base64
        img_b64 = base64.b64encode(file_bytes).decode("utf-8")
        img = ImageContent(image_base64=img_b64)
        user_msg = UserMessage(
            text="Analyze this photograph and output the JSON per your system schema. No preamble.",
            file_contents=[img],
        )
        response = await chat.send_message(user_msg)

    text = response if isinstance(response, str) else str(response)
    return _extract_json(text)
