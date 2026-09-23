import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import {
  Undo2, Redo2, RotateCcw, Download, Upload as UploadIcon, BookmarkPlus,
  Sparkles, Film, ArrowLeft, Trash2,
} from "lucide-react";
import { API, api, fileUrl } from "../lib/api";
import { NEUTRAL_PARAMS, paramsFromAnalysis, HSL_BANDS } from "../lib/grade";
import { loadPresets, savePreset, deletePreset } from "../lib/presets";
import EditorCanvas from "../components/EditorCanvas";
import { ParamSlider, TempSlider } from "../components/EditorSliders";
import { Button } from "../components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import { Input } from "../components/ui/input";

const clone = (o) => JSON.parse(JSON.stringify(o));

export default function EditorPage() {
  const { id } = useParams(); // /edit or /edit/from/:id

  const [srcImage, setSrcImage] = useState(null);         // HTMLImageElement (for canvas)
  const [srcFile, setSrcFile] = useState(null);           // Blob (for full-res export)
  const [srcName, setSrcName] = useState("photo.jpg");
  const [srcKind, setSrcKind] = useState("image");        // 'image' | 'video'
  const [videoBlobUrl, setVideoBlobUrl] = useState(null); // for previewing video
  const [aiParams, setAiParams] = useState(NEUTRAL_PARAMS());
  const [params, setParams] = useState(NEUTRAL_PARAMS());
  const [presetName, setPresetName] = useState("");
  const [busy, setBusy] = useState(false);
  const [videoBusy, setVideoBusy] = useState(false);
  const [presets, setPresets] = useState(loadPresets());

  const history = useRef({ past: [], future: [], last: null });
  const inputRef = useRef(null);

  // Load starting analysis (if /edit/from/:id)
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
        // Auto-load the analyzed image as the working image
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

  // Push a snapshot when params change (rAF-debounced by a flag)
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

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e) => {
      if (e.target?.tagName === "INPUT" || e.target?.tagName === "TEXTAREA") return;
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      else if ((e.metaKey || e.ctrlKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) { e.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // File selection
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
      toast.info("Video loaded — sliders shown, export applies via .cube LUT");
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

  // Update a single param field
  const set = (patch) => setParams((p) => ({ ...p, ...patch }));
  const setHsl = (band, axis, val) =>
    setParams((p) => ({
      ...p,
      hsl: { ...p.hsl, [band]: { ...p.hsl[band], [axis]: val } },
    }));

  // Apply a saved preset
  const applyPreset = (preset) => {
    setParams(clone(preset.params));
    toast.success(`Applied preset "${preset.name}"`);
  };

  // Save current as preset
  const saveAsPreset = () => {
    const name = presetName.trim() || `Preset ${new Date().toLocaleString()}`;
    savePreset(name, params);
    setPresets(loadPresets());
    setPresetName("");
    toast.success(`Saved preset "${name}"`);
  };
  const removePreset = (pid) => {
    setPresets(deletePreset(pid));
    toast.success("Preset deleted");
  };

  // Export photo (full resolution via backend)
  const exportPhoto = async () => {
    if (!srcFile) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", srcFile, srcName);
      fd.append("params", JSON.stringify(params));
      fd.append("max_side", "2400");
      const resp = await axios.post(`${API}/edit/photo`, fd, { responseType: "blob", timeout: 90000 });
      const blob = new Blob([resp.data], { type: "image/jpeg" });
      triggerDownload(blob, srcName.replace(/\.[^.]+$/, "") + "_chromalens.jpg");
      toast.success("Full resolution export ready");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Export failed");
    } finally {
      setBusy(false);
    }
  };

  // Export video (server-side ffmpeg with LUT)
  const exportVideo = async () => {
    if (!srcFile) return;
    setVideoBusy(true);
    toast.info("Grading your video — this may take up to 2 minutes");
    try {
      const fd = new FormData();
      fd.append("file", srcFile, srcName);
      fd.append("params", JSON.stringify(params));
      const resp = await axios.post(`${API}/edit/video`, fd, { responseType: "blob", timeout: 300000 });
      const blob = new Blob([resp.data], { type: "video/mp4" });
      triggerDownload(blob, srcName.replace(/\.[^.]+$/, "") + "_chromalens.mp4");
      toast.success("Graded video ready");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Video export failed");
    } finally {
      setVideoBusy(false);
    }
  };

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

  const startingFromPreset = !!id;

  return (
    <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-16">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-4 flex-wrap mb-4">
        <div className="flex items-center gap-3">
          {startingFromPreset && (
            <Link
              to={`/analysis/${id}`}
              className="text-sm text-slate-400 hover:text-amber-300 flex items-center gap-1"
              data-testid="editor-back"
            >
              <ArrowLeft size={14} /> Back
            </Link>
          )}
          <div>
            <div className="cl-label">Studio · Live Color Editor</div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-100">
              {srcKind === "video" ? "Grading your video" : "Editing your photo"}
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={undo} className="h-9 border-white/10" data-testid="undo-btn"><Undo2 size={14} /></Button>
          <Button variant="outline" onClick={redo} className="h-9 border-white/10" data-testid="redo-btn"><Redo2 size={14} /></Button>
          <Button variant="outline" onClick={resetAll} className="h-9 border-white/10 text-xs" data-testid="reset-ai-btn">
            <RotateCcw size={14} className="mr-1.5" /> Reset to AI
          </Button>
          <Button variant="outline" onClick={resetToNeutral} className="h-9 border-white/10 text-xs" data-testid="reset-neutral-btn">
            Neutral
          </Button>
          {srcKind === "image" && srcFile && (
            <Button onClick={exportPhoto} disabled={busy} className="cl-btn-primary h-10 px-5 rounded-lg" data-testid="export-photo-btn">
              <Download size={14} className="mr-2" /> {busy ? "Exporting…" : "Export JPG"}
            </Button>
          )}
          {srcKind === "video" && srcFile && (
            <Button onClick={exportVideo} disabled={videoBusy} className="cl-btn-primary h-10 px-5 rounded-lg" data-testid="export-video-btn">
              <Film size={14} className="mr-2" /> {videoBusy ? "Rendering…" : "Export MP4"}
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Canvas */}
        <div className="lg:col-span-8">
          <div className="cl-card overflow-hidden aspect-[16/10] flex items-center justify-center" data-testid="editor-canvas-wrap">
            {srcKind === "image" && srcImage && (
              <EditorCanvas image={srcImage} params={params} maxSide={1000} />
            )}
            {srcKind === "video" && videoBlobUrl && (
              <div className="text-center p-8">
                <video
                  src={videoBlobUrl}
                  controls
                  className="max-h-[400px] max-w-full rounded mx-auto"
                  data-testid="editor-video-preview"
                />
                <p className="mt-4 text-sm text-slate-400">
                  Video preview shown raw. Slider changes are applied on export via a baked .cube LUT.
                </p>
              </div>
            )}
            {!srcFile && (
              <button
                onClick={pickFile}
                className="w-full h-full flex flex-col items-center justify-center text-center hover:bg-white/5 transition-colors border-2 border-dashed border-white/10 hover:border-amber-500/40 rounded-none"
                data-testid="editor-picker"
              >
                <UploadIcon size={32} className="text-amber-400 mb-4" />
                <p className="font-display text-xl text-slate-100">Load a photo or video to edit</p>
                <p className="text-sm text-slate-400 mt-2">JPG, PNG, WEBP · MP4, MOV</p>
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
          </div>

          {srcFile && (
            <div className="mt-3 flex items-center justify-between gap-3 font-mono-tech text-xs text-slate-400">
              <span className="truncate">
                <span className="text-slate-500">FILE · </span>
                <span className="text-slate-200">{srcName}</span>
              </span>
              <button
                onClick={pickFile}
                className="text-amber-400 hover:text-amber-300 transition-colors"
                data-testid="editor-change-file"
              >
                Change file →
              </button>
            </div>
          )}
        </div>

        {/* Right panel: controls */}
        <div className="lg:col-span-4 space-y-4">
          <div className="cl-card p-4">
            <Tabs defaultValue="basic" className="w-full">
              <TabsList className="bg-black/40 border border-white/10 w-full grid grid-cols-4">
                <TabsTrigger value="basic" data-testid="tab-basic">Basic</TabsTrigger>
                <TabsTrigger value="tone" data-testid="tab-tone">Tone</TabsTrigger>
                <TabsTrigger value="hsl" data-testid="tab-hsl">HSL</TabsTrigger>
                <TabsTrigger value="fx" data-testid="tab-fx">FX</TabsTrigger>
              </TabsList>

              <TabsContent value="basic" className="mt-4 space-y-1">
                <TempSlider value={params.temperature} onChange={(v) => set({ temperature: v })} />
                <ParamSlider label="Tint" value={params.tint} min={-150} max={150} onChange={(v) => set({ tint: v })} testId="slider-tint" />
                <ParamSlider label="Exposure" value={params.exposure} min={-5} max={5} step={0.1} unit=" EV" onChange={(v) => set({ exposure: Math.round(v * 10) / 10 })} testId="slider-exposure" />
                <ParamSlider label="Contrast" value={params.contrast} min={-100} max={100} onChange={(v) => set({ contrast: v })} testId="slider-contrast" />
                <ParamSlider label="Saturation" value={params.saturation} min={-100} max={100} onChange={(v) => set({ saturation: v })} testId="slider-saturation" />
                <ParamSlider label="Vibrance" value={params.vibrance} min={-100} max={100} onChange={(v) => set({ vibrance: v })} testId="slider-vibrance" />
              </TabsContent>

              <TabsContent value="tone" className="mt-4 space-y-1">
                <ParamSlider label="Highlights" value={params.highlights} min={-100} max={100} onChange={(v) => set({ highlights: v })} testId="slider-highlights" />
                <ParamSlider label="Shadows" value={params.shadows} min={-100} max={100} onChange={(v) => set({ shadows: v })} testId="slider-shadows" />
                <ParamSlider label="Whites" value={params.whites} min={-100} max={100} onChange={(v) => set({ whites: v })} testId="slider-whites" />
                <ParamSlider label="Blacks" value={params.blacks} min={-100} max={100} onChange={(v) => set({ blacks: v })} testId="slider-blacks" />
              </TabsContent>

              <TabsContent value="hsl" className="mt-4">
                <HslMatrix hsl={params.hsl} onChange={setHsl} />
              </TabsContent>

              <TabsContent value="fx" className="mt-4 space-y-1">
                <ParamSlider label="Vignette" value={params.vignette} min={-100} max={100} onChange={(v) => set({ vignette: v })} testId="slider-vignette" />
                <ParamSlider label="Grain" value={params.grain} min={0} max={100} onChange={(v) => set({ grain: v })} testId="slider-grain" />
              </TabsContent>
            </Tabs>
          </div>

          {/* Save preset */}
          <div className="cl-card p-4">
            <div className="cl-label mb-2 flex items-center gap-1.5">
              <BookmarkPlus size={12} /> Save current as preset
            </div>
            <div className="flex gap-2">
              <Input
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                placeholder="Name (e.g. Golden Hour)"
                className="bg-black/40 border-white/10 text-slate-100 h-9"
                data-testid="preset-name-input"
              />
              <Button onClick={saveAsPreset} className="cl-btn-primary h-9 px-4" data-testid="save-preset-btn">
                Save
              </Button>
            </div>
          </div>

          {/* Preset library */}
          {presets.length > 0 && (
            <div className="cl-card p-4" data-testid="preset-library">
              <div className="cl-label mb-3 flex items-center gap-1.5">
                <Sparkles size={12} /> My Presets ({presets.length})
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {presets.map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-2 p-2 rounded hover:bg-white/5 group" data-testid={`preset-${p.id}`}>
                    <button
                      onClick={() => applyPreset(p)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="text-sm text-slate-100 truncate">{p.name}</div>
                      <div className="text-[10px] font-mono-tech text-slate-500 truncate">
                        {p.params.temperature}K · exp {p.params.exposure} · sat {p.params.saturation}
                      </div>
                    </button>
                    <button
                      onClick={() => removePreset(p.id)}
                      className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 transition-opacity"
                      title="Delete preset"
                      data-testid={`delete-preset-${p.id}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function HslMatrix({ hsl, onChange }) {
  const colors = {
    red: "#EF4444", orange: "#F97316", yellow: "#EAB308", green: "#22C55E",
    aqua: "#06B6D4", blue: "#3B82F6", purple: "#8B5CF6", magenta: "#EC4899",
  };
  return (
    <div className="space-y-3" data-testid="hsl-matrix">
      <div className="grid grid-cols-[80px_repeat(3,1fr)_20px] gap-x-2 text-[10px] font-mono-tech uppercase tracking-widest text-slate-500 pb-2 border-b border-white/5">
        <div>Color</div>
        <div className="text-center">Hue</div>
        <div className="text-center">Sat</div>
        <div className="text-center">Lum</div>
        <div />
      </div>
      {HSL_BANDS.map(([name]) => {
        const c = hsl[name] || { hue: 0, saturation: 0, luminance: 0 };
        return (
          <div key={name} className="grid grid-cols-[80px_repeat(3,1fr)_20px] items-center gap-x-2">
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
            <span />
          </div>
        );
      })}
    </div>
  );
}
