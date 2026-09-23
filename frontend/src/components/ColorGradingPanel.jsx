import { useMemo } from "react";
import { Copy, Download, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./ui/tabs";
import { Button } from "./ui/button";
import { API } from "../lib/api";

function SliderRow({ label, value, min, max, unit = "" }) {
  const pct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
  const centerPct = ((0 - min) / (max - min)) * 100;
  const isSigned = min < 0 && max > 0;
  const fillLeft = isSigned ? Math.min(centerPct, pct) : 0;
  const fillWidth = isSigned ? Math.abs(pct - centerPct) : pct;

  return (
    <div className="py-2.5" data-testid={`slider-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>
      <div className="flex items-baseline justify-between mb-2">
        <span className="cl-label">{label}</span>
        <span className="cl-data text-xs">
          {value > 0 && isSigned ? "+" : ""}
          {value}
          {unit}
        </span>
      </div>
      <div className="cl-slider-track">
        <div
          className="cl-slider-fill"
          style={{ left: `${fillLeft}%`, width: `${fillWidth}%` }}
        />
        <div className="cl-slider-marker" style={{ left: `${pct}%` }} />
      </div>
    </div>
  );
}

function HslMatrix({ hsl }) {
  const colors = [
    ["red", "#EF4444"],
    ["orange", "#F97316"],
    ["yellow", "#EAB308"],
    ["green", "#22C55E"],
    ["aqua", "#06B6D4"],
    ["blue", "#3B82F6"],
    ["purple", "#8B5CF6"],
    ["magenta", "#EC4899"],
  ];
  return (
    <div className="mt-2">
      <div className="grid grid-cols-[110px_repeat(3,1fr)] gap-x-3 text-[10px] font-mono-tech uppercase tracking-widest text-slate-500 pb-2 border-b border-white/5">
        <div>Color</div>
        <div className="text-center">Hue</div>
        <div className="text-center">Sat</div>
        <div className="text-center">Lum</div>
      </div>
      {colors.map(([key, hex]) => {
        const c = hsl?.[key] || { hue: 0, saturation: 0, luminance: 0 };
        return (
          <div
            key={key}
            className="grid grid-cols-[110px_repeat(3,1fr)] gap-x-3 items-center py-1.5 border-b border-white/5"
            data-testid={`hsl-${key}`}
          >
            <div className="flex items-center gap-2">
              <span
                className="w-3 h-3 rounded-full ring-1 ring-white/10"
                style={{ background: hex }}
              />
              <span className="text-xs text-slate-300 capitalize">{key}</span>
            </div>
            {["hue", "saturation", "luminance"].map((axis) => {
              const v = c[axis] ?? 0;
              const color = v > 0 ? "text-amber-400" : v < 0 ? "text-cyan-400" : "text-slate-500";
              return (
                <div key={axis} className={`text-center font-mono-tech text-xs ${color}`}>
                  {v > 0 ? "+" : ""}
                  {v}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function ColorWheel({ title, values, testId }) {
  const scale = 40;
  const r = (values?.r ?? 0) * scale;
  const g = (values?.g ?? 0) * scale;
  const b = (values?.b ?? 0) * scale;
  // Compose a point from R (right), G (up-left), B (down-left) vectors
  const rx = r;
  const gx = -g * Math.cos(Math.PI / 6);
  const gy = -g * Math.sin(Math.PI / 6);
  const bx = -b * Math.cos(Math.PI / 6);
  const by = b * Math.sin(Math.PI / 6);
  const x = 50 + rx + gx + bx;
  const y = 50 + gy + by;

  return (
    <div className="flex flex-col items-center" data-testid={testId}>
      <div className="relative w-[100px] h-[100px] rounded-full border border-white/10"
        style={{
          background:
            "conic-gradient(from 0deg, #ef4444, #f59e0b, #eab308, #22c55e, #06b6d4, #3b82f6, #8b5cf6, #ec4899, #ef4444)",
        }}
      >
        <div
          className="absolute inset-1 rounded-full"
          style={{ background: "radial-gradient(circle, rgba(10,12,16,0.85), rgba(10,12,16,0.4))" }}
        />
        <div
          className="absolute w-2 h-2 rounded-full bg-amber-400 ring-2 ring-[#0A0C10] shadow-[0_0_12px_rgba(245,158,11,0.9)]"
          style={{ left: `${x}%`, top: `${y}%`, transform: "translate(-50%, -50%)" }}
        />
      </div>
      <div className="cl-label mt-2">{title}</div>
      <div className="font-mono-tech text-[10px] text-slate-400 mt-1">
        R{(values?.r ?? 0).toFixed(2)} G{(values?.g ?? 0).toFixed(2)} B{(values?.b ?? 0).toFixed(2)}
      </div>
      <div className="font-mono-tech text-[10px] text-cyan-300">
        Y{(values?.y ?? 0).toFixed(2)}
      </div>
    </div>
  );
}

export default function ColorGradingPanel({ analysis, analysisId }) {
  const lr = analysis?.lightroom || {};
  const dv = analysis?.davinci || {};
  const mood = analysis?.mood || {};
  const palette = analysis?.palette || [];

  const lightroomText = useMemo(() => {
    const hslLines = Object.entries(lr.hsl || {})
      .map(
        ([k, v]) =>
          `  ${k.padEnd(8)}  H:${v.hue >= 0 ? "+" : ""}${v.hue}  S:${v.saturation >= 0 ? "+" : ""}${v.saturation}  L:${v.luminance >= 0 ? "+" : ""}${v.luminance}`
      )
      .join("\n");
    return `# ChromaLens · Lightroom Preset
Temperature   : ${lr.temperature} K
Tint          : ${lr.tint}
Exposure      : ${lr.exposure} EV
Contrast      : ${lr.contrast}
Highlights    : ${lr.highlights}
Shadows       : ${lr.shadows}
Whites        : ${lr.whites}
Blacks        : ${lr.blacks}
Texture       : ${lr.texture}
Clarity       : ${lr.clarity}
Dehaze        : ${lr.dehaze}
Vibrance      : ${lr.vibrance}
Saturation    : ${lr.saturation}

# HSL Adjustments
${hslLines}
`;
  }, [lr]);

  const davinciText = useMemo(() => {
    const wheel = (n, v) =>
      `${n.padEnd(8)}  R:${(v?.r ?? 0).toFixed(3)}  G:${(v?.g ?? 0).toFixed(3)}  B:${(v?.b ?? 0).toFixed(3)}  Y:${(v?.y ?? 0).toFixed(3)}`;
    return `# ChromaLens · DaVinci Resolve
${wheel("Lift", dv.lift)}
${wheel("Gamma", dv.gamma)}
${wheel("Gain", dv.gain)}
${wheel("Offset", dv.offset)}
Saturation : ${dv.saturation}
Contrast   : ${dv.contrast}
Pivot      : ${dv.pivot}

# Colorist Notes
${dv.notes || ""}
`;
  }, [dv]);

  const cc = analysis?.capcut || {};
  const capcutText = useMemo(() => {
    const row = (k, v) => `${k.padEnd(13)}: ${v >= 0 && typeof v === "number" && k !== "Sharpen" && k !== "Fade" && k !== "Vignette" && k !== "Grain" ? (v > 0 ? "+" + v : v) : v}`;
    return `# ChromaLens · CapCut Adjustments
Brightness   : ${cc.brightness}
Contrast     : ${cc.contrast}
Saturation   : ${cc.saturation}
Sharpen      : ${cc.sharpen}
Highlights   : ${cc.highlights}
Shadows      : ${cc.shadows}
Whites       : ${cc.whites}
Blacks       : ${cc.blacks}
Temperature  : ${cc.temperature}
Tint         : ${cc.tint}
Hue          : ${cc.hue}
Fade         : ${cc.fade}
Vignette     : ${cc.vignette}
Grain        : ${cc.grain}

# Suggested Filter
${cc.filter_suggestion || ""}

# Workflow
${cc.notes || ""}
`;
  }, [cc]);

  const copy = async (text, label) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied to clipboard`);
    } catch {
      toast.error("Copy failed");
    }
  };

  if (!analysis) return null;

  return (
    <div className="cl-card p-6" data-testid="color-grading-panel">
      <div className="flex items-start justify-between mb-5 gap-4 flex-wrap">
        <div>
          <div className="cl-label mb-1">03 · Color Grading Formula</div>
          <h3 className="font-display text-xl font-semibold text-slate-100">
            {mood.title || "Recipe"}
          </h3>
          {mood.description && (
            <p className="text-sm text-slate-400 mt-2 max-w-xl leading-relaxed">
              {mood.description}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-3">
          {analysisId && (
            <div className="flex gap-2 flex-wrap justify-end">
              <Link
                to={`/edit/from/${analysisId}`}
                data-testid="open-in-editor-btn"
                className="inline-flex items-center gap-2 px-4 h-10 rounded-lg bg-amber-500 hover:bg-amber-400 text-[#0A0C10] transition-colors text-sm font-semibold shadow-[0_6px_24px_-8px_rgba(245,158,11,0.6)]"
              >
                <Wand2 size={14} />
                Open in Editor
              </Link>
              <a
                href={`${API}/luts/${analysisId}.cube`}
                download
                onClick={() => toast.success(".cube LUT download started")}
                data-testid="download-lut-btn"
                className="inline-flex items-center gap-2 px-4 h-10 rounded-lg bg-white/5 hover:bg-amber-500/10 border border-amber-500/30 hover:border-amber-400 text-amber-300 hover:text-amber-200 transition-colors text-sm font-medium"
              >
                <Download size={14} />
                .cube LUT
              </a>
            </div>
          )}
          {palette.length > 0 && (
            <div className="flex gap-1.5" data-testid="palette-swatches">
              {palette.slice(0, 6).map((p, i) => (
                <div
                  key={i}
                  className="w-9 h-9 rounded-md ring-1 ring-white/10 relative group cursor-pointer"
                  style={{ background: p.hex }}
                  onClick={() => copy(p.hex, p.hex)}
                  title={`${p.name} · ${p.hex}`}
                  data-testid={`palette-swatch-${i}`}
                >
                  <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 font-mono-tech text-[9px] text-slate-400 whitespace-nowrap transition-opacity">
                    {p.hex}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Tabs defaultValue="lightroom" className="w-full">
        <TabsList className="bg-black/40 border border-white/10">
          <TabsTrigger value="lightroom" data-testid="tab-lightroom">
            Lightroom
          </TabsTrigger>
          <TabsTrigger value="davinci" data-testid="tab-davinci">
            DaVinci Resolve
          </TabsTrigger>
          <TabsTrigger value="capcut" data-testid="tab-capcut">
            CapCut
          </TabsTrigger>
        </TabsList>

        <TabsContent value="lightroom" className="mt-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1">
            <SliderRow label="Temperature" value={lr.temperature ?? 5500} min={2000} max={10000} unit=" K" />
            <SliderRow label="Tint" value={lr.tint ?? 0} min={-150} max={150} />
            <SliderRow label="Exposure" value={lr.exposure ?? 0} min={-5} max={5} unit=" EV" />
            <SliderRow label="Contrast" value={lr.contrast ?? 0} min={-100} max={100} />
            <SliderRow label="Highlights" value={lr.highlights ?? 0} min={-100} max={100} />
            <SliderRow label="Shadows" value={lr.shadows ?? 0} min={-100} max={100} />
            <SliderRow label="Whites" value={lr.whites ?? 0} min={-100} max={100} />
            <SliderRow label="Blacks" value={lr.blacks ?? 0} min={-100} max={100} />
            <SliderRow label="Texture" value={lr.texture ?? 0} min={-100} max={100} />
            <SliderRow label="Clarity" value={lr.clarity ?? 0} min={-100} max={100} />
            <SliderRow label="Dehaze" value={lr.dehaze ?? 0} min={-100} max={100} />
            <SliderRow label="Vibrance" value={lr.vibrance ?? 0} min={-100} max={100} />
            <SliderRow label="Saturation" value={lr.saturation ?? 0} min={-100} max={100} />
          </div>

          <div className="mt-6">
            <div className="cl-label mb-3">HSL Matrix</div>
            <HslMatrix hsl={lr.hsl} />
          </div>

          <Button
            onClick={() => copy(lightroomText, "Lightroom preset")}
            className="mt-6 cl-btn-primary h-10 px-5 rounded-lg"
            data-testid="copy-lightroom-btn"
          >
            <Copy size={14} className="mr-2" /> Copy Lightroom Preset
          </Button>
        </TabsContent>

        <TabsContent value="davinci" className="mt-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 justify-items-center bg-black/20 rounded-xl p-4 border border-white/5">
            <ColorWheel title="Lift" values={dv.lift} testId="wheel-lift" />
            <ColorWheel title="Gamma" values={dv.gamma} testId="wheel-gamma" />
            <ColorWheel title="Gain" values={dv.gain} testId="wheel-gain" />
            <ColorWheel title="Offset" values={dv.offset} testId="wheel-offset" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-8 mt-5">
            <SliderRow label="Saturation" value={dv.saturation ?? 1} min={0} max={2} />
            <SliderRow label="Contrast" value={dv.contrast ?? 1} min={0} max={2} />
            <SliderRow label="Pivot" value={dv.pivot ?? 0.435} min={0} max={1} />
          </div>

          {dv.notes && (
            <div className="mt-5 p-4 rounded-lg bg-black/30 border border-white/5">
              <div className="cl-label mb-2">Colorist Notes</div>
              <p className="text-sm text-slate-300 leading-relaxed font-mono-tech">{dv.notes}</p>
            </div>
          )}

          <Button
            onClick={() => copy(davinciText, "DaVinci recipe")}
            className="mt-6 cl-btn-primary h-10 px-5 rounded-lg"
            data-testid="copy-davinci-btn"
          >
            <Copy size={14} className="mr-2" /> Copy DaVinci Recipe
          </Button>
        </TabsContent>

        <TabsContent value="capcut" className="mt-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1">
            <SliderRow label="Brightness" value={cc.brightness ?? 0} min={-100} max={100} />
            <SliderRow label="Contrast" value={cc.contrast ?? 0} min={-100} max={100} />
            <SliderRow label="Saturation" value={cc.saturation ?? 0} min={-100} max={100} />
            <SliderRow label="Sharpen" value={cc.sharpen ?? 0} min={0} max={100} />
            <SliderRow label="Highlights" value={cc.highlights ?? 0} min={-100} max={100} />
            <SliderRow label="Shadows" value={cc.shadows ?? 0} min={-100} max={100} />
            <SliderRow label="Whites" value={cc.whites ?? 0} min={-100} max={100} />
            <SliderRow label="Blacks" value={cc.blacks ?? 0} min={-100} max={100} />
            <SliderRow label="Temperature" value={cc.temperature ?? 0} min={-100} max={100} />
            <SliderRow label="Tint" value={cc.tint ?? 0} min={-100} max={100} />
            <SliderRow label="Hue" value={cc.hue ?? 0} min={-100} max={100} />
            <SliderRow label="Fade" value={cc.fade ?? 0} min={0} max={100} />
            <SliderRow label="Vignette" value={cc.vignette ?? 0} min={0} max={100} />
            <SliderRow label="Grain" value={cc.grain ?? 0} min={0} max={100} />
          </div>

          {cc.filter_suggestion && (
            <div className="mt-6 p-4 rounded-lg bg-gradient-to-r from-amber-500/10 to-cyan-500/5 border border-amber-500/20">
              <div className="cl-label mb-2">Suggested CapCut Filter</div>
              <p className="text-sm text-slate-100 font-mono-tech" data-testid="capcut-filter">
                {cc.filter_suggestion}
              </p>
            </div>
          )}

          {cc.notes && (
            <div className="mt-3 p-4 rounded-lg bg-black/30 border border-white/5">
              <div className="cl-label mb-2">Workflow</div>
              <p className="text-sm text-slate-300 leading-relaxed font-mono-tech">{cc.notes}</p>
            </div>
          )}

          <Button
            onClick={() => copy(capcutText, "CapCut recipe")}
            className="mt-6 cl-btn-primary h-10 px-5 rounded-lg"
            data-testid="copy-capcut-btn"
          >
            <Copy size={14} className="mr-2" /> Copy CapCut Recipe
          </Button>
        </TabsContent>
      </Tabs>
    </div>
  );
}
