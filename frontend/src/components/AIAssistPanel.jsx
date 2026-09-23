import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import {
  Sparkles, Wand2, ImagePlus, Loader2, Upload,
} from "lucide-react";
import { API } from "../lib/api";
import { paramsFromAnalysis } from "../lib/grade";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

const MOODS_UI = [
  { id: "cinematic-teal-orange", label: "Cinematic", tint: "from-cyan-500 to-orange-500", emoji: "🎬" },
  { id: "warm-film-kodak", label: "Warm Film", tint: "from-amber-500 to-rose-400", emoji: "📽" },
  { id: "cool-cyberpunk", label: "Cyberpunk", tint: "from-fuchsia-500 to-cyan-400", emoji: "🌃" },
  { id: "golden-hour", label: "Golden Hour", tint: "from-yellow-500 to-orange-500", emoji: "🌇" },
  { id: "moody-overcast", label: "Moody", tint: "from-slate-500 to-blue-500", emoji: "☁" },
  { id: "bright-airy", label: "Bright & Airy", tint: "from-sky-300 to-pink-200", emoji: "✨" },
  { id: "vintage-faded", label: "Vintage", tint: "from-amber-700 to-yellow-600", emoji: "📻" },
  { id: "dark-dramatic", label: "Dramatic", tint: "from-red-800 to-slate-900", emoji: "🌋" },
  { id: "portrait-glow", label: "Portrait Glow", tint: "from-orange-300 to-rose-400", emoji: "👤" },
  { id: "vibrant-travel", label: "Travel", tint: "from-teal-400 to-yellow-400", emoji: "🌍" },
];

export default function AIAssistPanel({ currentImageFile, onApply, sceneHint = "" }) {
  const [tab, setTab] = useState("enhance");
  const [busy, setBusy] = useState(null);
  const [refFile, setRefFile] = useState(null);
  const [refPreview, setRefPreview] = useState(null);
  const [scene, setScene] = useState("");
  const refInputRef = useRef(null);

  useEffect(() => {
    return () => {
      if (refPreview) URL.revokeObjectURL(refPreview);
    };
  }, [refPreview]);

  async function callAI(fd, kind) {
    setBusy(kind);
    try {
      const resp = await axios.post(`${API}/ai/assist`, fd, { timeout: 120000 });
      const grade = resp.data?.grade;
      if (!grade) throw new Error("Empty response");
      const params = paramsFromAnalysis(grade);
      onApply(params, grade);
      toast.success(grade.title ? `Applied: ${grade.title}` : "AI grade applied");
    } catch (e) {
      toast.error(e?.response?.data?.detail || e?.message || "AI assist failed");
    } finally {
      setBusy(null);
    }
  }

  const runEnhance = () => {
    if (!currentImageFile) {
      toast.error("Load a photo into the editor first");
      return;
    }
    const fd = new FormData();
    fd.append("mode", "enhance");
    fd.append("file", currentImageFile, currentImageFile.name || "photo.jpg");
    callAI(fd, "enhance");
  };

  const runMatch = () => {
    if (!refFile) {
      toast.error("Upload a reference photo first");
      return;
    }
    const fd = new FormData();
    fd.append("mode", "match");
    fd.append("file", refFile, refFile.name || "ref.jpg");
    callAI(fd, "match");
  };

  const runMood = (moodId) => {
    const fd = new FormData();
    fd.append("mode", "mood");
    fd.append("mood_id", moodId);
    if (scene || sceneHint) fd.append("scene", scene || sceneHint);
    callAI(fd, `mood-${moodId}`);
  };

  const pickRef = () => refInputRef.current?.click();
  const onRefFile = (f) => {
    if (!f) return;
    if (!f.type?.startsWith("image/")) {
      toast.error("Please choose an image file");
      return;
    }
    setRefFile(f);
    if (refPreview) URL.revokeObjectURL(refPreview);
    setRefPreview(URL.createObjectURL(f));
  };

  return (
    <div className="w-full" data-testid="ai-assist-panel">
      {/* Sub-tabs */}
      <div className="flex gap-1 mb-4 p-1 rounded-lg bg-black/40 border border-white/10">
        {[
          ["enhance", "Auto-Enhance", Sparkles],
          ["match", "Match Style", ImagePlus],
          ["mood", "Mood", Wand2],
        ].map(([id, label, Icon]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            data-testid={`ai-subtab-${id}`}
            className={`flex-1 h-9 rounded-md text-xs font-mono-tech uppercase tracking-widest transition-colors inline-flex items-center justify-center gap-1.5 ${
              tab === id
                ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Icon size={12} />
            {label}
          </button>
        ))}
      </div>

      {tab === "enhance" && (
        <div className="text-center py-4" data-testid="ai-enhance-tab">
          <div className="mx-auto w-14 h-14 rounded-full bg-gradient-to-br from-amber-500/30 to-cyan-500/20 border border-amber-500/40 flex items-center justify-center mb-3">
            <Sparkles size={24} className="text-amber-300" />
          </div>
          <h3 className="font-display text-lg text-slate-100 mb-1.5">One-tap Auto-Enhance</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto mb-5 leading-relaxed">
            Gemini 3.1 Pro reviews the current photo and dials in a professional,
            cinematic grade — balanced WB, tone, HSL, split-toning and a subtle
            vignette. All values become editable after.
          </p>
          <Button
            onClick={runEnhance}
            disabled={busy === "enhance" || !currentImageFile}
            className="cl-btn-primary h-11 px-6 rounded-lg"
            data-testid="ai-enhance-btn"
          >
            {busy === "enhance" ? (
              <><Loader2 size={14} className="mr-2 animate-spin" /> Analyzing…</>
            ) : (
              <><Sparkles size={14} className="mr-2" /> Auto-Enhance This Photo</>
            )}
          </Button>
          {!currentImageFile && (
            <p className="mt-3 text-[10px] font-mono-tech text-slate-500 uppercase tracking-widest">
              Load a photo into the editor first
            </p>
          )}
        </div>
      )}

      {tab === "match" && (
        <div data-testid="ai-match-tab">
          <p className="text-xs text-slate-400 mb-3 leading-relaxed">
            Upload any inspiration photo — a movie still, a fashion editorial, a friend&apos;s shot — and the AI extracts its color grade so you can apply the same look to yours.
          </p>
          <input
            ref={refInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => onRefFile(e.target.files?.[0])}
            data-testid="ai-match-file-input"
          />
          {refPreview ? (
            <div className="rounded-lg overflow-hidden bg-black border border-white/10 mb-3 relative">
              <img src={refPreview} alt="Reference" className="w-full max-h-56 object-contain" />
              <button
                onClick={pickRef}
                className="absolute top-2 right-2 px-2 py-1 rounded bg-black/70 text-xs text-amber-300 hover:text-amber-200"
              >
                Change
              </button>
            </div>
          ) : (
            <button
              onClick={pickRef}
              className="w-full py-8 rounded-lg border-2 border-dashed border-white/10 hover:border-amber-500/40 hover:bg-white/5 transition-colors flex flex-col items-center gap-2 mb-3"
              data-testid="ai-match-pick"
            >
              <Upload size={20} className="text-amber-400" />
              <span className="text-sm text-slate-200">Upload reference photo</span>
              <span className="text-[10px] font-mono-tech uppercase tracking-widest text-slate-500">JPG · PNG · WEBP</span>
            </button>
          )}
          <Button
            onClick={runMatch}
            disabled={busy === "match" || !refFile}
            className="cl-btn-primary w-full h-10 rounded-lg"
            data-testid="ai-match-btn"
          >
            {busy === "match" ? (
              <><Loader2 size={14} className="mr-2 animate-spin" /> Extracting grade…</>
            ) : (
              <><ImagePlus size={14} className="mr-2" /> Extract &amp; Apply Look</>
            )}
          </Button>
        </div>
      )}

      {tab === "mood" && (
        <div data-testid="ai-mood-tab">
          <p className="text-xs text-slate-400 mb-3 leading-relaxed">
            Pick a mood — the AI generates a full grade recipe tailored to it in seconds.
          </p>
          <div className="mb-3">
            <Input
              value={scene}
              onChange={(e) => setScene(e.target.value)}
              placeholder="Optional: describe the scene (e.g. 'portrait at sunset')"
              className="bg-black/40 border-white/10 text-slate-100 h-9 text-sm"
              data-testid="ai-mood-scene"
            />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-2 gap-2">
            {MOODS_UI.map((m) => {
              const isBusy = busy === `mood-${m.id}`;
              return (
                <button
                  key={m.id}
                  onClick={() => runMood(m.id)}
                  disabled={!!busy}
                  data-testid={`ai-mood-${m.id}`}
                  className={`relative overflow-hidden rounded-lg border transition-all group ${
                    isBusy
                      ? "border-amber-500 ring-2 ring-amber-500/50"
                      : "border-white/10 hover:border-amber-500/50 hover:scale-[1.02]"
                  }`}
                >
                  <div className={`aspect-[3/1] bg-gradient-to-br ${m.tint} opacity-90`} />
                  <div className="absolute inset-0 p-2.5 flex items-center gap-2 bg-black/30">
                    <span className="text-lg">{m.emoji}</span>
                    <span className="font-display text-xs text-white font-semibold tracking-tight">
                      {m.label}
                    </span>
                    {isBusy && (
                      <Loader2 size={12} className="ml-auto text-white animate-spin" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
