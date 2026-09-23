"""AI-powered editing assistants — enhance / mood / match-reference.

All three flows return an "analysis" dict compatible with lut._params():
{
  "lightroom": {temperature, tint, exposure, contrast, highlights,
                shadows, whites, blacks, saturation, vibrance,
                hsl: {red/orange/.../magenta: {hue,sat,lum}},
                split_toning: {shadow_hue, shadow_saturation,
                               highlight_hue, highlight_saturation, balance}},
  "effects":   {vignette, grain},
  "title":     "short evocative title",
  "note":      "one-sentence colorist's rationale"
}
"""
from __future__ import annotations

import base64
import json
import os
import re
import uuid
from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent


EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY")
MODEL_PROVIDER = "gemini"
MODEL_NAME = "gemini-3.1-pro-preview"


SCHEMA = """{
  "title": "3-5 word title",
  "note": "one-sentence colorist rationale (<=120 chars)",
  "lightroom": {
    "temperature": 5500, "tint": 0, "exposure": 0.0, "contrast": 0,
    "highlights": 0, "shadows": 0, "whites": 0, "blacks": 0,
    "saturation": 0, "vibrance": 0,
    "hsl": {
      "red":     {"hue": 0, "saturation": 0, "luminance": 0},
      "orange":  {"hue": 0, "saturation": 0, "luminance": 0},
      "yellow":  {"hue": 0, "saturation": 0, "luminance": 0},
      "green":   {"hue": 0, "saturation": 0, "luminance": 0},
      "aqua":    {"hue": 0, "saturation": 0, "luminance": 0},
      "blue":    {"hue": 0, "saturation": 0, "luminance": 0},
      "purple":  {"hue": 0, "saturation": 0, "luminance": 0},
      "magenta": {"hue": 0, "saturation": 0, "luminance": 0}
    },
    "split_toning": {
      "shadow_hue": 220, "shadow_saturation": 0,
      "highlight_hue": 40, "highlight_saturation": 0,
      "balance": 0
    }
  },
  "effects": {"vignette": 0, "grain": 0}
}

Ranges:
- temperature: 2000-10000 (K), tint: -150..150, exposure: -5..5 (EV)
- contrast/highlights/shadows/whites/blacks/saturation/vibrance: -100..100
- HSL per-band hue/sat/luminance: -100..100
- split_toning hues: 0-360, saturations/balance: -100..100 (sat is 0-100)
- vignette: -100..100 (negative darkens corners), grain: 0..100
"""

ENHANCE_PROMPT = f"""You are a senior colorist reviewing a photograph.
Look at the image and design the BEST professional creative enhancement — cinematic, polished, publish-ready — that respects the subject and lighting.
Don't neutralize; add character. Balance shadows/highlights, correct WB toward the intended mood, tune HSL, add a tasteful split-tone and a subtle vignette if it helps. Keep grain <=15 unless the image is clearly film-like.

Return ONE JSON object (no markdown, no commentary) matching:
{SCHEMA}
"""

MATCH_PROMPT = f"""You are a colorist. Analyse the color grade of this reference photograph and return the exact settings a colorist would use to recreate its look.
Focus purely on the grade (white balance, tone curve, HSL, split-toning, vignette, grain). Ignore composition / subject.

Return ONE JSON object (no markdown, no commentary) matching:
{SCHEMA}
"""

MOODS = {
    "cinematic-teal-orange": "Modern Hollywood cinematic teal & orange: crushed cyan shadows, warm orange highlights and skin, gentle contrast, subtle vignette, slight grain.",
    "warm-film-kodak": "Warm Kodak Portra 400 film emulation: creamy skin, muted greens, lifted shadows, subtle magenta cast, fine grain, gentle contrast.",
    "cool-cyberpunk": "Cool cyberpunk / neon: teal shadows, magenta highlights, high saturation on blues and magentas, deep blacks, strong vibrance, no grain.",
    "golden-hour": "Warm golden-hour glow: warm WB, orange highlight tint, lifted shadows, honey saturation, gentle contrast, no grain.",
    "moody-overcast": "Moody overcast / rainy: cool WB, desaturated greens/yellows, negative vibrance in warm tones, crushed blacks, slight vignette, mild grain.",
    "bright-airy": "Bright & airy fashion: high exposure, low contrast, lifted shadows, soft whites, pastel HSL, minimal vignette, no grain.",
    "vintage-faded": "Vintage faded look: matte blacks (positive blacks), reduced contrast, warm-yellow highlights, muted saturation, film grain 20-30.",
    "dark-dramatic": "Dark & dramatic: negative exposure, deep contrast, crushed blacks, intense HSL saturation on reds/oranges, heavy vignette (-40 to -60), light grain.",
    "portrait-glow": "Flattering portrait skin glow: neutral-warm WB, softened highlights, lifted shadows, boosted orange luminance, red/orange saturation up, tiny vignette.",
    "vibrant-travel": "Vibrant travel: crisp contrast, high vibrance, saturated blues and greens, warmer highlights, neutral shadows, no grain.",
}


def _mood_prompt(mood_id: str, scene: str = "") -> str:
    desc = MOODS.get(mood_id, mood_id)
    scene_line = f"\nThe image content is roughly: {scene}" if scene else ""
    return (
        f"""You are a senior colorist. Design a professional color grade that captures this mood:
"{desc}"{scene_line}

Return ONE JSON object (no markdown, no commentary) matching:
{SCHEMA}
"""
    )


def _extract_json(text: str) -> dict:
    if not text:
        raise ValueError("Empty response")
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    m = re.search(r"\{.*\}", text, re.DOTALL)
    if not m:
        raise ValueError(f"No JSON in response: {text[:200]}")
    return json.loads(m.group(0))


async def _call_gemini(system: str, image_bytes: bytes | None) -> dict:
    chat = (
        LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"chromalens-ai-{uuid.uuid4()}",
            system_message=system,
        ).with_model(MODEL_PROVIDER, MODEL_NAME)
    )
    if image_bytes:
        img = ImageContent(image_base64=base64.b64encode(image_bytes).decode("utf-8"))
        msg = UserMessage(text="Follow the instructions and return only the JSON.", file_contents=[img])
    else:
        msg = UserMessage(text="Follow the instructions and return only the JSON.")
    response = await chat.send_message(msg)
    text = response if isinstance(response, str) else str(response)
    return _extract_json(text)


async def enhance(image_bytes: bytes) -> dict:
    return await _call_gemini(ENHANCE_PROMPT, image_bytes)


async def match_reference(image_bytes: bytes) -> dict:
    return await _call_gemini(MATCH_PROMPT, image_bytes)


async def mood_grade(mood_id: str, scene: str = "") -> dict:
    return await _call_gemini(_mood_prompt(mood_id, scene), image_bytes=None)


def list_moods() -> list[dict]:
    return [{"id": k, "description": v} for k, v in MOODS.items()]
