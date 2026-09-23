import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import {
  Undo2, Redo2, RotateCcw, Download, Upload as UploadIcon, BookmarkPlus,
  Sparkles, Film, ArrowLeft, Trash2, Layers, Plus, FileArchive,
} from "lucide-react";
import { API, api, fileUrl } from "../lib/api";
import { NEUTRAL_PARAMS, paramsFromAnalysis, HSL_BANDS } from "../lib/grade";
import { loadPresets, savePreset, deletePreset } from "../lib/presets";
import EditorCanvas from "../components/EditorCanvas";
import { ParamSlider, TempSlider } from "../components/EditorSliders";
import HuePicker from "../components/HuePicker";
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
  const [batchFiles, setBatchFiles] = useState([]);
  const [batchBusy, setBatchBusy] = useState(false);

  const history = useRef({ past: [], future: [], last: null });
  const inputRef = useRef(null);
  const batchInputRef = useRef(null);

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
  const setSplit = (patch) =>
    setParams((p) => ({ ...p, split_toning: { ...p.split_toning, ...patch } }));
  const applyTealOrange = () =>
    setSplit({ shadow_hue: 200, shadow_saturation: 45, highlight_hue: 35, highlight_saturation: 40, balance: 0 });
  const applyPurpleGreen = () =>
    setSplit({ shadow_hue: 270, shadow_saturation: 35, highlight_hue: 90, highlight_saturation: 30, balance: 0 });
  const applyMagentaCyan = () =>
    setSplit({ shadow_hue: 300, shadow_saturation: 40, highlight_hue: 180, highlight_saturation: 35, balance: 0 });

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

  // Batch export
  const addBatchFiles = (fileList) => {
    if (!fileList) return;
    const incoming = Array.from(fileList)
      .filter((f) => f.type.startsWith("image/"))
      .map((f) => ({ file: f, id: `b_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` }));
    setBatchFiles((cur) => {
      const merged = [...cur, ...incoming];
      if (merged.length > 30) {
        toast.warning("Batch capped at 30 photos");
      }
      return merged.slice(0, 30);
    });
  };
  const removeBatchFile = (id) => setBatchFiles((cur) => cur.filter((b) => b.id !== id));
  const clearBatch = () => setBatchFiles([]);
  const exportBatch = async () => {
    if (batchFiles.length === 0) {
      toast.error("Add at least one photo to the batch");
      return;
    }
    setBatchBusy(true);
    toast.info(`Grading ${batchFiles.length} photos…`);
    try {
      const fd = new FormData();
      batchFiles.forEach((b) => fd.append("files", b.file, b.file.name));
      fd.append("params", JSON.stringify(params));
      fd.append("max_side", "2400");
      const resp = await axios.post(`${API}/edit/batch`, fd, {
        responseType: "blob",
        timeout: 300000,
      });
      const blob = new Blob([resp.data], { type: "application/zip" });
      const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      triggerDownload(blob, `chromalens_batch_${stamp}.zip`);
      toast.success(`Zip with ${batchFiles.length} graded photos ready`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Batch export failed");
    } finally {
      setBatchBusy(false);
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
              <TabsList className="bg-black/40 border border-white/10 w-full grid grid-cols-5">
                <TabsTrigger value="basic" data-testid="tab-basic">Basic</TabsTrigger>
                <TabsTrigger value="tone" data-testid="tab-tone">Tone</TabsTrigger>
                <TabsTrigger value="hsl" data-testid="tab-hsl">HSL</TabsTrigger>
                <TabsTrigger value="split" data-testid="tab-split">Split</TabsTrigger>
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

              <TabsContent value="split" className="mt-4" data-testid="split-tab-content">
                <div className="flex flex-wrap gap-1.5 mb-4">
                  <button
                    type="button"
                    onClick={applyTealOrange}
                    className="px-2.5 py-1.5 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-300 hover:bg-amber-500/20 transition-colors font-mono-tech text-[10px] uppercase tracking-widest"
                    data-testid="quick-teal-orange"
                  >
                    Teal &amp; Orange
                  </button>
                  <button
                    type="button"
                    onClick={applyPurpleGreen}
                    className="px-2.5 py-1.5 rounded-md bg-purple-500/10 border border-purple-500/30 text-purple-300 hover:bg-purple-500/20 transition-colors font-mono-tech text-[10px] uppercase tracking-widest"
                    data-testid="quick-purple-green"
                  >
                    Purple &amp; Lime
                  </button>
                  <button
                    type="button"
                    onClick={applyMagentaCyan}
                    className="px-2.5 py-1.5 rounded-md bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/20 transition-colors font-mono-tech text-[10px] uppercase tracking-widest"
                    data-testid="quick-magenta-cyan"
                  >
                    Magenta &amp; Cyan
                  </button>
                  <button
                    type="button"
                    onClick={() => setSplit({ shadow_saturation: 0, highlight_saturation: 0, balance: 0 })}
                    className="ml-auto px-2.5 py-1.5 rounded-md bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 transition-colors font-mono-tech text-[10px] uppercase tracking-widest"
                    data-testid="split-clear"
                  >
                    Clear
                  </button>
                </div>

                {/* Highlights */}
                <div className="pb-4 mb-4 border-b border-white/5">
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className="w-3 h-3 rounded-full ring-1 ring-white/10"
                      style={{ background: `hsl(${params.split_toning.highlight_hue} 90% 55%)` }}
                    />
                    <div className="cl-label">Highlights</div>
                  </div>
                  <HuePicker
                    value={params.split_toning.highlight_hue}
                    onChange={(v) => setSplit({ highlight_hue: v })}
                    testId="split-highlight-hue"
                  />
                  <div className="mt-2">
                    <ParamSlider
                      label="Amount"
                      value={params.split_toning.highlight_saturation}
                      min={0}
                      max={100}
                      onChange={(v) => setSplit({ highlight_saturation: v })}
                      testId="split-highlight-sat"
                    />
                  </div>
                </div>

                {/* Shadows */}
                <div className="pb-4 mb-4 border-b border-white/5">
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className="w-3 h-3 rounded-full ring-1 ring-white/10"
                      style={{ background: `hsl(${params.split_toning.shadow_hue} 90% 45%)` }}
                    />
                    <div className="cl-label">Shadows</div>
                  </div>
                  <HuePicker
                    value={params.split_toning.shadow_hue}
                    onChange={(v) => setSplit({ shadow_hue: v })}
                    testId="split-shadow-hue"
                  />
                  <div className="mt-2">
                    <ParamSlider
                      label="Amount"
                      value={params.split_toning.shadow_saturation}
                      min={0}
                      max={100}
                      onChange={(v) => setSplit({ shadow_saturation: v })}
                      testId="split-shadow-sat"
                    />
                  </div>
                </div>

                {/* Balance */}
                <ParamSlider
                  label="Balance"
                  value={params.split_toning.balance}
                  min={-100}
                  max={100}
                  onChange={(v) => setSplit({ balance: v })}
                  testId="split-balance"
                />
                <p className="mt-2 text-[10px] font-mono-tech text-slate-500 leading-relaxed">
                  Balance shifts the midpoint between shadow and highlight zones —
                  positive pushes more tones toward the shadow tint.
                </p>
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

          {/* Batch export */}
          <div className="cl-card p-4" data-testid="batch-panel">
            <div className="flex items-center justify-between mb-3">
              <div className="cl-label flex items-center gap-1.5">
                <Layers size={12} /> Batch Export
                {batchFiles.length > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px]">
                    {batchFiles.length}
                  </span>
                )}
              </div>
              <button
                onClick={() => batchInputRef.current?.click()}
                className="text-xs text-amber-400 hover:text-amber-300 transition-colors font-medium inline-flex items-center gap-1"
                data-testid="batch-add-btn"
              >
                <Plus size={12} /> Add photos
              </button>
              <input
                ref={batchInputRef}
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => { addBatchFiles(e.target.files); e.target.value = ""; }}
                data-testid="batch-file-input"
              />
            </div>

            {batchFiles.length === 0 ? (
              <p className="text-xs text-slate-400 leading-relaxed">
                Add up to 30 photos and apply the current grade to all of them in
                one zip download.
              </p>
            ) : (
              <>
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1 mb-3">
                  {batchFiles.map((b) => (
                    <div
                      key={b.id}
                      className="flex items-center justify-between gap-2 py-1 px-2 rounded bg-white/5 group"
                      data-testid={`batch-item-${b.id}`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-xs text-slate-100 truncate">{b.file.name}</div>
                        <div className="text-[10px] font-mono-tech text-slate-500">
                          {(b.file.size / (1024 * 1024)).toFixed(1)} MB
                        </div>
                      </div>
                      <button
                        onClick={() => removeBatchFile(b.id)}
                        className="text-slate-500 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                        title="Remove"
                        data-testid={`batch-remove-${b.id}`}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={exportBatch}
                    disabled={batchBusy}
                    className="cl-btn-primary flex-1 h-9"
                    data-testid="batch-export-btn"
                  >
                    <FileArchive size={13} className="mr-1.5" />
                    {batchBusy ? "Zipping…" : `Export .zip (${batchFiles.length})`}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={clearBatch}
                    className="h-9 border-white/10 text-xs"
                    data-testid="batch-clear-btn"
                  >
                    Clear
                  </Button>
                </div>
              </>
            )}
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
