/* JS mirror of backend lut.apply_grade. Renders to a canvas in real time.
 *
 * Params shape (all optional, defaults are neutral):
 *   temperature: 2000..10000 (K)   tint: -150..150
 *   exposure: -5..5 (EV)           contrast: -100..100
 *   highlights/shadows/whites/blacks: -100..100
 *   saturation/vibrance: -100..100
 *   hsl: { red:{hue,saturation,luminance}, ... 8 bands }
 *   vignette: -100..100    grain: 0..100
 */

export const HSL_BANDS = [
  ["red", 0],
  ["orange", 30],
  ["yellow", 60],
  ["green", 120],
  ["aqua", 180],
  ["blue", 240],
  ["purple", 270],
  ["magenta", 330],
];

export const NEUTRAL_PARAMS = () => ({
  temperature: 5500,
  tint: 0,
  exposure: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
  whites: 0,
  blacks: 0,
  texture: 0,
  clarity: 0,
  dehaze: 0,
  saturation: 0,
  vibrance: 0,
  hsl: Object.fromEntries(
    HSL_BANDS.map(([k]) => [k, { hue: 0, saturation: 0, luminance: 0 }])
  ),
  vignette: 0,
  grain: 0,
});

export function paramsFromAnalysis(analysis) {
  const p = NEUTRAL_PARAMS();
  const lr = analysis?.lightroom || {};
  const fx = analysis?.effects || {};
  const keys = [
    "temperature", "tint", "exposure", "contrast", "highlights",
    "shadows", "whites", "blacks", "texture", "clarity", "dehaze",
    "saturation", "vibrance",
  ];
  for (const k of keys) {
    if (typeof lr[k] === "number") p[k] = lr[k];
  }
  const hsl = lr.hsl || {};
  for (const [name] of HSL_BANDS) {
    const src = hsl[name] || {};
    p.hsl[name] = {
      hue: Number(src.hue) || 0,
      saturation: Number(src.saturation) || 0,
      luminance: Number(src.luminance) || 0,
    };
  }
  if (typeof fx.vignette === "number") p.vignette = fx.vignette;
  if (typeof fx.grain === "number") p.grain = fx.grain;
  return p;
}

// Deterministic pseudo random for grain
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rgbToHsl(r, g, b) {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const c = mx - mn;
  const l = (mx + mn) / 2;
  let h = 0;
  if (c > 1e-6) {
    if (mx === r) h = ((g - b) / c) % 6;
    else if (mx === g) h = (b - r) / c + 2;
    else h = (r - g) / c + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = c < 1e-6 ? 0 : c / (1 - Math.abs(2 * l - 1) + 1e-9);
  return [h, s, l];
}

function hslToRgb(h, s, l) {
  if (s < 1e-6) return [l, l, l];
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r1 = 0, g1 = 0, b1 = 0;
  if (hp < 1) [r1, g1, b1] = [c, x, 0];
  else if (hp < 2) [r1, g1, b1] = [x, c, 0];
  else if (hp < 3) [r1, g1, b1] = [0, c, x];
  else if (hp < 4) [r1, g1, b1] = [0, x, c];
  else if (hp < 5) [r1, g1, b1] = [x, 0, c];
  else [r1, g1, b1] = [c, 0, x];
  const m = l - c / 2;
  return [r1 + m, g1 + m, b1 + m];
}

function bandWeight(hue, center, sigma) {
  let d = Math.abs(hue - center);
  if (d > 180) d = 360 - d;
  return Math.exp(-(d * d) / (2 * sigma * sigma));
}

/** Apply grade to Uint8ClampedArray RGBA image data in-place. */
export function applyGradeToImageData(imageData, p) {
  const { data, width: W, height: H } = imageData;
  const n = data.length;

  const expGain = Math.pow(2, Math.max(-5, Math.min(5, p.exposure)));
  const tempShift = Math.max(-1.5, Math.min(1.5, (p.temperature - 5500) / 5500)) * 0.18;
  const tintShift = Math.max(-1, Math.min(1, p.tint / 150)) * 0.12;
  const contrast = 1 + p.contrast / 100;
  const hi = p.highlights / 100;
  const sh = p.shadows / 100;
  const wh = p.whites / 100;
  const bl = p.blacks / 100;
  const sat = 1 + p.saturation / 100;
  const vib = p.vibrance / 200;
  const hslOn = HSL_BANDS.some(([k]) => {
    const v = p.hsl?.[k];
    return v && (v.hue || v.saturation || v.luminance);
  });
  const vignetteAmt = Math.max(-100, Math.min(100, p.vignette || 0)) / 100;
  const grainAmt = Math.max(0, Math.min(100, p.grain || 0)) / 100 * 0.10;
  const rand = grainAmt > 0 ? mulberry32(42) : null;

  const cy = H / 2, cx = W / 2;
  const maxD = Math.sqrt(cy * cy + cx * cx);

  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

  for (let i = 0, px = 0; i < n; i += 4, px++) {
    let r = data[i] / 255;
    let g = data[i + 1] / 255;
    let b = data[i + 2] / 255;

    // exposure
    r *= expGain; g *= expGain; b *= expGain;
    // white balance
    r *= 1 + tempShift; b *= 1 - tempShift;
    g *= 1 - tintShift; r *= 1 + tintShift * 0.4; b *= 1 + tintShift * 0.4;
    // tone
    r = (r - 0.5) * contrast + 0.5;
    g = (g - 0.5) * contrast + 0.5;
    b = (b - 0.5) * contrast + 0.5;
    const applyTone = (x) => {
      if (hi !== 0) x = x - hi * 0.35 * Math.pow(Math.max(0, x - 0.5), 1.4) * 2;
      if (sh !== 0) x = x + sh * 0.35 * Math.pow(Math.max(0, 0.5 - x), 1.4) * 2;
      if (wh !== 0) x = x + wh * 0.15 * (x * x);
      if (bl !== 0 && x < 0.35) x = x + bl * 0.15 * ((1 - x) * (1 - x));
      return x;
    };
    r = applyTone(r); g = applyTone(g); b = applyTone(b);
    // saturation
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    r = luma + (r - luma) * sat;
    g = luma + (g - luma) * sat;
    b = luma + (b - luma) * sat;
    // vibrance
    if (vib !== 0) {
      const cur = Math.max(r, g, b) - Math.min(r, g, b);
      const w = Math.max(0, Math.min(1, 1 - cur));
      r = luma + (r - luma) * (1 + vib * w);
      g = luma + (g - luma) * (1 + vib * w);
      b = luma + (b - luma) * (1 + vib * w);
    }
    // HSL
    if (hslOn) {
      const rc = clamp01(r), gc = clamp01(g), bc = clamp01(b);
      const [h, s_, l_] = rgbToHsl(rc, gc, bc);
      let dh = 0, ds = 0, dl = 0;
      for (const [name, center] of HSL_BANDS) {
        const band = p.hsl[name];
        if (!band) continue;
        if (band.hue === 0 && band.saturation === 0 && band.luminance === 0) continue;
        const w = bandWeight(h, center, 30);
        dh += w * band.hue * 0.6;
        ds += w * band.saturation / 100;
        dl += w * band.luminance / 200;
      }
      const hNew = ((h + dh) % 360 + 360) % 360;
      const sNew = Math.max(0, Math.min(1, s_ * (1 + ds)));
      const lNew = Math.max(0, Math.min(1, l_ + dl));
      [r, g, b] = hslToRgb(hNew, sNew, lNew);
    }
    // vignette
    if (vignetteAmt !== 0) {
      const y = Math.floor(px / W);
      const x = px - y * W;
      const d = Math.sqrt((y - cy) * (y - cy) + (x - cx) * (x - cx)) / maxD;
      const mask = Math.pow(Math.max(0, Math.min(1, (d - 0.3) / 0.7)), 2);
      const factor = 1 - vignetteAmt * mask;
      r *= factor; g *= factor; b *= factor;
    }
    // grain
    if (grainAmt > 0) {
      const noise = (rand() - 0.5) * 2 * grainAmt;
      r += noise; g += noise; b += noise;
    }

    data[i]     = Math.max(0, Math.min(255, r * 255 + 0.5));
    data[i + 1] = Math.max(0, Math.min(255, g * 255 + 0.5));
    data[i + 2] = Math.max(0, Math.min(255, b * 255 + 0.5));
  }
  return imageData;
}
