import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import {
  Undo2, Redo2, RotateCcw, Download, Upload as UploadIcon, BookmarkPlus,
  Sparkles, Film, ArrowLeft, Trash2, Layers, Plus, FileArchive, X,
  Sliders, PaintBucket, Palette, Contrast as ContrastIcon, Droplet,
} from "lucide-react";
import { API, api, fileUrl } from "../lib/api";
import { NEUTRAL_PARAMS, paramsFromAnalysis, HSL_BANDS } from "../lib/grade";
import { loadPresets, savePreset, deletePreset } from "../lib/presets";
import { useI18n } from "../lib/i18n";
import EditorCanvas from "../components/EditorCanvas";
import { ParamSlider, TempSlider } from "../components/EditorSliders";
import HuePicker from "../components/HuePicker";
import AIAssistPanel from "../components/AIAssistPanel";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";

const clone = (o) => JSON.parse(JSON.stringify(o));

const TOOL_KEYS = ["ai", "adjust", "tone", "hsl", "split", "fx", "presets", "batch"];
const TOOL_ICONS = { ai: Sparkles, adjust: Sliders, tone: ContrastIcon, hsl: Palette, split: PaintBucket, fx: Droplet, presets: BookmarkPlus, batch: Layers };

export default function EditorPage() {
  const { id } = useParams();
  const { t } = useI18n();

  const [srcImage, setSrcImage] = useState(null);
  const [srcFile, setSrcFile] = useState(null);
  const [srcName, setSrcName] = useState("photo.jpg");
  const [srcKind, setSrcKind] = useState("image");
  const [videoBlobUrl, setVideoBlobUrl] = useState(null);
  const [aiParams, setAiParams] = useState(NEUTRAL_PARAMS());
  const [params, setParams] = useState(NEUTRAL_PARAMS());
  const [sceneHint, setSceneHint] = useState("");

  const [busy, setBusy] = useState(false);
  const [videoBusy, setVideoBusy] = useState(false);
  const [batchBusy, setBatchBusy] = useState(false);
  const [presets, setPresets] = useState(loadPresets());
  const [presetName, setPresetName] = useState("");
  const [batchFiles, setBatchFiles] = useState([]);

  const [activeTool, setActiveTool] = useState(null); // controls open drawer
  const history = useRef({ past: [], future: [], last: null });
  const inputRef = useRef(null);
  const batchInputRef = useRef(null);

  // Load starting analysis
  useEffect(() => {
    if (!id) return;
    let cancel = false;
    (async () => {
      try {
        const { data } = await api.get(`/analyses/${id}`);
        const p = paramsFromAnalysis(data.analysis);
        if (cancel) return;
        setAiParams(clone(p));
        setParams(clone(p));
        history.current = { past: [], future: [], last: clone(p) };
        setSceneHint(data.analysis?.mood?.title || "");
        if (data.media_type === "image") {
          const resp = await fetch(fileUrl(id));
          const blob = await resp.blob();
          const url = URL.createObjectURL(blob);
          const img = new Image();
          img.onload = () => {
            if (cancel) return;
            setSrcImage(img);
            setSrcFile(blob);
            setSrcName((data.original_filename || "photo.jpg").replace(/\.[^.]+$/, "") + ".jpg");
            setSrcKind("image");
          };
          img.src = url;
        }
      } catch {
        toast.error("Could not load starting preset");
      }
    })();
    return () => { cancel = true; };
  }, [id]);
  useEffect(() => {
    const last = history.current.last;
    if (last && JSON.stringify(last) === JSON.stringify(params)) return;
    if (last) history.current.past.push(last);
    history.current.past = history.current.past.slice(-40);
    history.current.future = [];
    history.current.last = clone(params);
  }, [params]);

  const undo = () => {
    const h = history.current;
    if (!h.past.length) return;
    const prev = h.past.pop();
    h.future.push(h.last);
    h.last = clone(prev);
    setParams(clone(prev));
  };
  const redo = () => {
    const h = history.current;
    if (!h.future.length) return;
    const next = h.future.pop();
    h.past.push(h.last);
    h.last = clone(next);
    setParams(clone(next));
  };
  const resetAll = () => setParams(clone(aiParams));
  const resetToNeutral = () => setParams(NEUTRAL_PARAMS());

  useEffect(() => {
    const onKey = (e) => {
      if (e.target?.tagName === "INPUT" || e.target?.tagName === "TEXTAREA") return;
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      else if ((e.metaKey || e.ctrlKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) { e.preventDefault(); redo(); }
      else if (e.key === "Escape") setActiveTool(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const pickFile = () => inputRef.current?.click();
  const onFile = async (f) => {
    if (!f) return;
    const type = f.type || "";
    if (type.startsWith("video/")) {
      const url = URL.createObjectURL(f);
      if (videoBlobUrl) URL.revokeObjectURL(videoBlobUrl);
      setVideoBlobUrl(url);
      setSrcFile(f);
      setSrcName(f.name || "clip.mp4");
      setSrcKind("video");
      setSrcImage(null);
      toast.info(t("editor.video_note"));
    } else if (type.startsWith("image/")) {
      const url = URL.createObjectURL(f);
      const img = new Image();
      img.onload = () => {
        setSrcImage(img);
        setSrcFile(f);
        setSrcName(f.name || "photo.jpg");
        setSrcKind("image");
      };
      img.src = url;
    } else {
      toast.error("Please choose an image or video file");
    }
  };

  const set = (patch) => setParams((p) => ({ ...p, ...patch }));
  const setHsl = (band, axis, val) =>
    setParams((p) => ({ ...p, hsl: { ...p.hsl, [band]: { ...p.hsl[band], [axis]: val } } }));
  const setSplit = (patch) =>
    setParams((p) => ({ ...p, split_toning: { ...p.split_toning, ...patch } }));
  const applyTealOrange = () =>
    setSplit({ shadow_hue: 200, shadow_saturation: 45, highlight_hue: 35, highlight_saturation: 40, balance: 0 });
  const applyPurpleGreen = () =>
    setSplit({ shadow_hue: 270, shadow_saturation: 35, highlight_hue: 90, highlight_saturation: 30, balance: 0 });
  const applyMagentaCyan = () =>
    setSplit({ shadow_hue: 300, shadow_saturation: 40, highlight_hue: 180, highlight_saturation: 35, balance: 0 });

  const applyPreset = (preset) => {
    setParams(clone(preset.params));
    toast.success(t("editor.toasts.preset_applied", { name: preset.name }));
  };
  const saveAsPreset = () => {
    const name = presetName.trim() || `Preset ${new Date().toLocaleString()}`;
    savePreset(name, params);
    setPresets(loadPresets());
    setPresetName("");
    toast.success(t("editor.toasts.preset_saved", { name }));
  };
  const removePreset = (pid) => {
    setPresets(deletePreset(pid));
    toast.success(t("editor.toasts.preset_deleted"));
  };

  const applyAIGrade = (aiParamsIn) => {
    setParams(aiParamsIn);
    setActiveTool(null);
  };

  // ---------- Exports ----------
  const triggerDownload = (blob, name) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };
  const exportPhoto = async () => {
    if (!srcFile) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", srcFile, srcName);
      fd.append("params", JSON.stringify(params));
      fd.append("max_side", "2400");
      const resp = await axios.post(`${API}/edit/photo`, fd, { responseType: "blob", timeout: 90000 });
      triggerDownload(new Blob([resp.data], { type: "image/jpeg" }), srcName.replace(/\.[^.]+$/, "") + "_chromalens.jpg");
      toast.success(t("editor.toasts.photo_ready"));
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Export failed");
    } finally { setBusy(false); }
  };
  const exportVideo = async () => {
    if (!srcFile) return;
    setVideoBusy(true);
    toast.info(t("editor.toasts.video_started"));
    try {
      const fd = new FormData();
      fd.append("file", srcFile, srcName);
      fd.append("params", JSON.stringify(params));
      const resp = await axios.post(`${API}/edit/video`, fd, { responseType: "blob", timeout: 300000 });
      triggerDownload(new Blob([resp.data], { type: "video/mp4" }), srcName.replace(/\.[^.]+$/, "") + "_chromalens.mp4");
      toast.success(t("editor.toasts.video_ready"));
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Video export failed");
    } finally { setVideoBusy(false); }
  };

  // ---------- Batch ----------
  const addBatchFiles = (fileList) => {
    if (!fileList) return;
    const incoming = Array.from(fileList)
      .filter((f) => f.type.startsWith("image/"))
      .map((f) => ({ file: f, id: `b_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` }));
    setBatchFiles((cur) => {
      const merged = [...cur, ...incoming];
      if (merged.length > 30) toast.warning(t("editor.toasts.batch_capped"));
      return merged.slice(0, 30);
    });
  };
  const removeBatchFile = (bid) => setBatchFiles((cur) => cur.filter((b) => b.id !== bid));
  const clearBatch = () => setBatchFiles([]);
  const exportBatch = async () => {
    if (batchFiles.length === 0) { toast.error(t("editor.toasts.batch_min")); return; }
    setBatchBusy(true);
    toast.info(`${t("editor.tools.batch")} · ${batchFiles.length}`);
    try {
      const fd = new FormData();
      batchFiles.forEach((b) => fd.append("files", b.file, b.file.name));
      fd.append("params", JSON.stringify(params));
      fd.append("max_side", "2400");
      const resp = await axios.post(`${API}/edit/batch`, fd, { responseType: "blob", timeout: 300000 });
      const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      triggerDownload(new Blob([resp.data], { type: "application/zip" }), `chromalens_batch_${stamp}.zip`);
      toast.success(t("editor.toasts.zip_ready", { n: batchFiles.length }));
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Batch export failed");
    } finally { setBatchBusy(false); }
  };

  const startingFromPreset = !!id;

  return (
    <div className="fixed inset-0 top-16 flex flex-col bg-[#0A0C10]">
      {/* Top action bar */}
      <div className="border-b border-white/10 bg-[#0A0C10]/95 backdrop-blur-xl">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            {startingFromPreset && (
              <Link
                to={`/analysis/${id}`}
                className="text-sm text-slate-400 hover:text-amber-300 flex items-center gap-1 flex-shrink-0"
                data-testid="editor-back"
              >
                <ArrowLeft size={14} /> {t("editor.back")}
              </Link>
            )}
            <div className="min-w-0">
              <div className="cl-label">{t("editor.eyebrow")}</div>
              <h1 className="font-display text-lg sm:text-xl font-bold text-slate-100 truncate">
                {srcKind === "video" ? t("editor.title_video") : t("editor.title_photo")}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <Button variant="outline" onClick={undo} className="h-9 border-white/10" data-testid="undo-btn"><Undo2 size={14} /></Button>
            <Button variant="outline" onClick={redo} className="h-9 border-white/10" data-testid="redo-btn"><Redo2 size={14} /></Button>
            <Button variant="outline" onClick={resetAll} className="h-9 border-white/10 text-xs" data-testid="reset-ai-btn">
              <RotateCcw size={14} className="mr-1.5" /> {t("editor.reset_ai")}
            </Button>
            <Button variant="outline" onClick={resetToNeutral} className="h-9 border-white/10 text-xs" data-testid="reset-neutral-btn">
              {t("editor.neutral")}
            </Button>
            {srcKind === "image" && srcFile && (
              <Button onClick={exportPhoto} disabled={busy} className="cl-btn-primary h-10 px-4 rounded-lg" data-testid="export-photo-btn">
                <Download size={14} className="mr-2" /> {busy ? t("editor.exporting") : t("editor.export_jpg")}
              </Button>
            )}
            {srcKind === "video" && srcFile && (
              <Button onClick={exportVideo} disabled={videoBusy} className="cl-btn-primary h-10 px-4 rounded-lg" data-testid="export-video-btn">
                <Film size={14} className="mr-2" /> {videoBusy ? t("editor.rendering") : t("editor.export_mp4")}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Canvas area */}
      <div className="flex-1 relative overflow-hidden bg-gradient-to-b from-[#0A0C10] to-black">
        {srcKind === "image" && srcImage && (
          <EditorCanvas image={srcImage} params={params} maxSide={1200} />
        )}
        {srcKind === "video" && videoBlobUrl && (
          <div className="w-full h-full flex items-center justify-center p-6 text-center">
            <div>
              <video src={videoBlobUrl} controls className="max-h-[60vh] max-w-full rounded shadow-2xl mx-auto" data-testid="editor-video-preview" />
              <p className="mt-4 text-sm text-slate-400">{t("editor.video_note")}</p>
            </div>
          </div>
        )}
        {!srcFile && (
          <button
            onClick={pickFile}
            className="absolute inset-0 flex flex-col items-center justify-center text-center hover:bg-white/[0.02] transition-colors"
            data-testid="editor-picker"
          >
            <UploadIcon size={40} className="text-amber-400 mb-4" />
            <p className="font-display text-2xl text-slate-100">{t("editor.picker_title")}</p>
            <p className="text-sm text-slate-400 mt-2">{t("editor.picker_sub")}</p>
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,.mov"
          onChange={(e) => onFile(e.target.files?.[0])}
          data-testid="editor-file-input"
        />

        {srcFile && (
          <div className="absolute top-3 left-4 flex items-center gap-2 font-mono-tech text-[10px] uppercase tracking-widest text-slate-500 pointer-events-none">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            {t("editor.live")} · {srcName}
          </div>
        )}
        {srcFile && (
          <button
            onClick={pickFile}
            className="absolute top-3 right-4 text-xs text-amber-400 hover:text-amber-300 transition-colors font-medium"
            data-testid="editor-change-file"
          >
            {t("editor.change_file")}
          </button>
        )}
      </div>

      {/* Drawer — opens above the tool tray */}
      {activeTool && (
        <div
          className="absolute inset-x-0 bottom-[76px] top-[64px] pointer-events-none z-30"
          data-testid={`drawer-${activeTool}`}
        >
          <div className="h-full w-full flex items-end justify-center">
            <div
              className="pointer-events-auto w-full max-w-2xl mx-auto bg-[#12151E]/95 backdrop-blur-2xl border-t border-x border-white/10 rounded-t-2xl shadow-[0_-30px_80px_-20px_rgba(0,0,0,0.9)] overflow-hidden cl-rise"
              style={{ maxHeight: "62vh" }}
            >
              <div className="flex items-center justify-between px-5 py-3 border-b border-white/5">
                <div className="cl-label">
                  {t(`editor.tools.${activeTool}`)}
                </div>
                <button
                  onClick={() => setActiveTool(null)}
                  className="text-slate-400 hover:text-amber-300 transition-colors"
                  data-testid="drawer-close"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="p-5 overflow-y-auto" style={{ maxHeight: "calc(62vh - 48px)" }}>
                {activeTool === "ai" && (
                  <AIAssistPanel
                    currentImageFile={srcFile}
                    onApply={applyAIGrade}
                    sceneHint={sceneHint}
                  />
                )}
                {activeTool === "adjust" && (
                  <div className="space-y-1">
                    <TempSlider value={params.temperature} onChange={(v) => set({ temperature: v })} />
                    <ParamSlider label="Tint" value={params.tint} min={-150} max={150} onChange={(v) => set({ tint: v })} testId="slider-tint" />
                    <ParamSlider label="Exposure" value={params.exposure} min={-5} max={5} step={0.1} unit=" EV" onChange={(v) => set({ exposure: Math.round(v * 10) / 10 })} testId="slider-exposure" />
                    <ParamSlider label="Contrast" value={params.contrast} min={-100} max={100} onChange={(v) => set({ contrast: v })} testId="slider-contrast" />
                    <ParamSlider label="Saturation" value={params.saturation} min={-100} max={100} onChange={(v) => set({ saturation: v })} testId="slider-saturation" />
                    <ParamSlider label="Vibrance" value={params.vibrance} min={-100} max={100} onChange={(v) => set({ vibrance: v })} testId="slider-vibrance" />
                  </div>
                )}
                {activeTool === "tone" && (
                  <div className="space-y-1">
                    <ParamSlider label="Highlights" value={params.highlights} min={-100} max={100} onChange={(v) => set({ highlights: v })} testId="slider-highlights" />
                    <ParamSlider label="Shadows" value={params.shadows} min={-100} max={100} onChange={(v) => set({ shadows: v })} testId="slider-shadows" />
                    <ParamSlider label="Whites" value={params.whites} min={-100} max={100} onChange={(v) => set({ whites: v })} testId="slider-whites" />
                    <ParamSlider label="Blacks" value={params.blacks} min={-100} max={100} onChange={(v) => set({ blacks: v })} testId="slider-blacks" />
                  </div>
                )}
                {activeTool === "hsl" && <HslMatrix hsl={params.hsl} onChange={setHsl} />}
                {activeTool === "split" && (
                  <SplitTonePanel
                    st={params.split_toning}
                    setSplit={setSplit}
                    applyTealOrange={applyTealOrange}
                    applyPurpleGreen={applyPurpleGreen}
                    applyMagentaCyan={applyMagentaCyan}
                  />
                )}
                {activeTool === "fx" && (
                  <div className="space-y-1">
                    <ParamSlider label="Vignette" value={params.vignette} min={-100} max={100} onChange={(v) => set({ vignette: v })} testId="slider-vignette" />
                    <ParamSlider label="Grain" value={params.grain} min={0} max={100} onChange={(v) => set({ grain: v })} testId="slider-grain" />
                  </div>
                )}
                {activeTool === "presets" && (
                  <PresetLibrary
                    presets={presets}
                    presetName={presetName}
                    setPresetName={setPresetName}
                    saveAsPreset={saveAsPreset}
                    applyPreset={applyPreset}
                    removePreset={removePreset}
                  />
                )}
                {activeTool === "batch" && (
                  <BatchPanel
                    batchFiles={batchFiles}
                    batchBusy={batchBusy}
                    addBatchFiles={addBatchFiles}
                    removeBatchFile={removeBatchFile}
                    clearBatch={clearBatch}
                    exportBatch={exportBatch}
                    batchInputRef={batchInputRef}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bottom tool tray — CapCut style */}
      <div className="border-t border-white/10 bg-[#0A0C10]/95 backdrop-blur-xl z-40" data-testid="tool-tray">
        <div className="max-w-[1600px] mx-auto px-2 sm:px-4">
          <div className="flex items-stretch overflow-x-auto scrollbar-hide">
            {TOOL_KEYS.map((tid) => {
              const Icon = TOOL_ICONS[tid];
              const isActive = activeTool === tid;
              const isAi = tid === "ai";
              return (
                <button
                  key={tid}
                  onClick={() => setActiveTool(isActive ? null : tid)}
                  data-testid={`tool-${tid}`}
                  className={`flex-1 min-w-[76px] py-3 px-2 flex flex-col items-center gap-1 transition-colors ${
                    isActive
                      ? "text-amber-300 bg-white/5"
                      : "text-slate-400 hover:text-slate-100 hover:bg-white/[0.03]"
                  }`}
                >
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all ${
                    isActive
                      ? "bg-amber-500/20 ring-2 ring-amber-500/50"
                      : isAi
                        ? "bg-gradient-to-br from-amber-500/15 to-cyan-500/10 ring-1 ring-amber-500/25"
                        : "bg-white/5"
                  }`}>
                    <Icon size={18} strokeWidth={2} className={isAi && !isActive ? "text-amber-300" : ""} />
                  </div>
                  <span className="text-[10px] font-mono-tech uppercase tracking-widest leading-none">
                    {t(`editor.tools.${tid}`)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- Sub-components ----------

function HslMatrix({ hsl, onChange }) {
  const colors = {
    red: "#EF4444", orange: "#F97316", yellow: "#EAB308", green: "#22C55E",
    aqua: "#06B6D4", blue: "#3B82F6", purple: "#8B5CF6", magenta: "#EC4899",
  };
  return (
    <div className="space-y-3" data-testid="hsl-matrix">
      <div className="grid grid-cols-[80px_repeat(3,1fr)] gap-x-2 text-[10px] font-mono-tech uppercase tracking-widest text-slate-500 pb-2 border-b border-white/5">
        <div>Color</div><div className="text-center">Hue</div><div className="text-center">Sat</div><div className="text-center">Lum</div>
      </div>
      {HSL_BANDS.map(([name]) => {
        const c = hsl[name] || { hue: 0, saturation: 0, luminance: 0 };
        return (
          <div key={name} className="grid grid-cols-[80px_repeat(3,1fr)] items-center gap-x-2">
            <div className="flex items-center gap-2 text-xs text-slate-300 capitalize">
              <span className="w-2.5 h-2.5 rounded-full ring-1 ring-white/10" style={{ background: colors[name] }} />
              {name}
            </div>
            {["hue", "saturation", "luminance"].map((axis) => (
              <input
                key={axis}
                type="range"
                min={-100}
                max={100}
                value={c[axis]}
                onChange={(e) => onChange(name, axis, parseInt(e.target.value, 10))}
                className="w-full accent-amber-500 h-1.5"
                data-testid={`hsl-${name}-${axis}`}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}

function SplitTonePanel({ st, setSplit, applyTealOrange, applyPurpleGreen, applyMagentaCyan }) {
  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-4">
        <button onClick={applyTealOrange} className="px-2.5 py-1.5 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-300 hover:bg-amber-500/20 transition-colors font-mono-tech text-[10px] uppercase tracking-widest" data-testid="quick-teal-orange">Teal &amp; Orange</button>
        <button onClick={applyPurpleGreen} className="px-2.5 py-1.5 rounded-md bg-purple-500/10 border border-purple-500/30 text-purple-300 hover:bg-purple-500/20 transition-colors font-mono-tech text-[10px] uppercase tracking-widest" data-testid="quick-purple-green">Purple &amp; Lime</button>
        <button onClick={applyMagentaCyan} className="px-2.5 py-1.5 rounded-md bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/20 transition-colors font-mono-tech text-[10px] uppercase tracking-widest" data-testid="quick-magenta-cyan">Magenta &amp; Cyan</button>
        <button onClick={() => setSplit({ shadow_saturation: 0, highlight_saturation: 0, balance: 0 })} className="ml-auto px-2.5 py-1.5 rounded-md bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 transition-colors font-mono-tech text-[10px] uppercase tracking-widest" data-testid="split-clear">Clear</button>
      </div>
      <div className="pb-4 mb-4 border-b border-white/5">
        <div className="flex items-center gap-2 mb-2">
          <span className="w-3 h-3 rounded-full ring-1 ring-white/10" style={{ background: `hsl(${st.highlight_hue} 90% 55%)` }} />
          <div className="cl-label">Highlights</div>
        </div>
        <HuePicker value={st.highlight_hue} onChange={(v) => setSplit({ highlight_hue: v })} testId="split-highlight-hue" />
        <div className="mt-2">
          <ParamSlider label="Amount" value={st.highlight_saturation} min={0} max={100} onChange={(v) => setSplit({ highlight_saturation: v })} testId="split-highlight-sat" />
        </div>
      </div>
      <div className="pb-4 mb-4 border-b border-white/5">
        <div className="flex items-center gap-2 mb-2">
          <span className="w-3 h-3 rounded-full ring-1 ring-white/10" style={{ background: `hsl(${st.shadow_hue} 90% 45%)` }} />
          <div className="cl-label">Shadows</div>
        </div>
        <HuePicker value={st.shadow_hue} onChange={(v) => setSplit({ shadow_hue: v })} testId="split-shadow-hue" />
        <div className="mt-2">
          <ParamSlider label="Amount" value={st.shadow_saturation} min={0} max={100} onChange={(v) => setSplit({ shadow_saturation: v })} testId="split-shadow-sat" />
        </div>
      </div>
      <ParamSlider label="Balance" value={st.balance} min={-100} max={100} onChange={(v) => setSplit({ balance: v })} testId="split-balance" />
    </div>
  );
}

function PresetLibrary({ presets, presetName, setPresetName, saveAsPreset, applyPreset, removePreset }) {
  return (
    <div>
      <div className="mb-4">
        <div className="cl-label mb-2 flex items-center gap-1.5"><BookmarkPlus size={12} /> Save current as preset</div>
        <div className="flex gap-2">
          <Input value={presetName} onChange={(e) => setPresetName(e.target.value)} placeholder="Name (e.g. Golden Hour)" className="bg-black/40 border-white/10 text-slate-100 h-9" data-testid="preset-name-input" />
          <Button onClick={saveAsPreset} className="cl-btn-primary h-9 px-4" data-testid="save-preset-btn">Save</Button>
        </div>
      </div>
      {presets.length > 0 ? (
        <div data-testid="preset-library">
          <div className="cl-label mb-3 flex items-center gap-1.5"><Sparkles size={12} /> My Presets ({presets.length})</div>
          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {presets.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-2 p-2 rounded hover:bg-white/5 group" data-testid={`preset-${p.id}`}>
                <button onClick={() => applyPreset(p)} className="min-w-0 flex-1 text-left">
                  <div className="text-sm text-slate-100 truncate">{p.name}</div>
                  <div className="text-[10px] font-mono-tech text-slate-500 truncate">
                    {p.params.temperature}K · exp {p.params.exposure} · sat {p.params.saturation}
                  </div>
                </button>
                <button onClick={() => removePreset(p.id)} className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 transition-opacity" title="Delete" data-testid={`delete-preset-${p.id}`}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-xs text-slate-400">No saved presets yet — tweak the sliders and save this look for later.</p>
      )}
    </div>
  );
}

function BatchPanel({ batchFiles, batchBusy, addBatchFiles, removeBatchFile, clearBatch, exportBatch, batchInputRef }) {
  return (
    <div data-testid="batch-panel">
      <div className="flex items-center justify-between mb-3">
        <div className="cl-label flex items-center gap-1.5">
          <Layers size={12} /> Batch Export
          {batchFiles.length > 0 && (
            <span className="ml-1 px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px]">
              {batchFiles.length}
            </span>
          )}
        </div>
        <button onClick={() => batchInputRef.current?.click()} className="text-xs text-amber-400 hover:text-amber-300 transition-colors font-medium inline-flex items-center gap-1" data-testid="batch-add-btn">
          <Plus size={12} /> Add photos
        </button>
        <input ref={batchInputRef} type="file" multiple accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { addBatchFiles(e.target.files); e.target.value = ""; }} data-testid="batch-file-input" />
      </div>
      {batchFiles.length === 0 ? (
        <p className="text-xs text-slate-400 leading-relaxed">Add up to 30 photos and apply the current grade to all of them in one zip download.</p>
      ) : (
        <>
          <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1 mb-3">
            {batchFiles.map((b) => (
              <div key={b.id} className="flex items-center justify-between gap-2 py-1 px-2 rounded bg-white/5 group" data-testid={`batch-item-${b.id}`}>
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-slate-100 truncate">{b.file.name}</div>
                  <div className="text-[10px] font-mono-tech text-slate-500">{(b.file.size / (1024 * 1024)).toFixed(1)} MB</div>
                </div>
                <button onClick={() => removeBatchFile(b.id)} className="text-slate-500 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100" title="Remove" data-testid={`batch-remove-${b.id}`}>
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Button onClick={exportBatch} disabled={batchBusy} className="cl-btn-primary flex-1 h-9" data-testid="batch-export-btn">
              <FileArchive size={13} className="mr-1.5" /> {batchBusy ? "Zipping…" : `Export .zip (${batchFiles.length})`}
            </Button>
            <Button variant="outline" onClick={clearBatch} className="h-9 border-white/10 text-xs" data-testid="batch-clear-btn">Clear</Button>
          </div>
        </>
      )}
    </div>
  );
}
