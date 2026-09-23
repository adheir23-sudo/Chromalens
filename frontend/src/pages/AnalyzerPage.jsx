import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import UploadZone from "../components/UploadZone";
import MediaPreview from "../components/MediaPreview";
import TechnicalPanel from "../components/TechnicalPanel";
import ColorGradingPanel from "../components/ColorGradingPanel";
import { api } from "../lib/api";
import { Sparkles } from "lucide-react";

export default function AnalyzerPage() {
  const [record, setRecord] = useState(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  const submit = async (file) => {
    setBusy(true);
    setRecord(null);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const { data } = await api.post("/analyze", fd, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 180000,
      });
      setRecord(data);
      toast.success("Analysis complete");
    } catch (e) {
      const msg =
        e?.response?.data?.detail ||
        e?.message ||
        "Analysis failed. Please try again.";
      toast.error(String(msg));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-12 pt-24 pb-24">
      {/* Hero */}
      <div className="mb-10 cl-rise" data-testid="hero-section">
        <div className="cl-label mb-3 flex items-center gap-2">
          <Sparkles size={12} className="text-amber-400" />
          Powered by Gemini 3.1 Pro
        </div>
        <h1 className="font-display font-bold text-slate-100 text-4xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-tight max-w-3xl">
          Reveal the{" "}
          <span className="bg-gradient-to-r from-amber-400 to-cyan-400 bg-clip-text text-transparent">
            color science
          </span>{" "}
          behind any shot.
        </h1>
        <p className="mt-5 text-slate-400 text-base sm:text-lg max-w-2xl leading-relaxed">
          Drop a photo or video clip and ChromaLens returns the camera, lens,
          resolution, bit depth, software, and a complete Lightroom &amp; DaVinci
          Resolve grading recipe you can copy and paste into your own edit.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
        <div className="lg:col-span-7">
          <UploadZone onFileSelected={submit} isBusy={busy} />

          {record && (
            <div className="mt-6 cl-rise">
              <MediaPreview record={record} />
            </div>
          )}
        </div>

        <div className="lg:col-span-5 space-y-6">
          {!record && !busy && <PromoBlock onSeeGallery={() => navigate("/gallery")} />}
          {busy && <AnalyzingBlock />}
          {record && (
            <>
              <TechnicalPanel technical={record.analysis?.technical} />
            </>
          )}
        </div>

        {record && (
          <div className="lg:col-span-12 cl-rise">
            <ColorGradingPanel analysis={record.analysis} />
          </div>
        )}
      </div>
    </div>
  );
}

function PromoBlock({ onSeeGallery }) {
  const items = [
    { k: "EXIF Telemetry", v: "Camera · Lens · ISO · Aperture · Shutter" },
    { k: "Format Details", v: "Resolution · Megapixels · Bit Depth · FPS" },
    { k: "Software ID", v: "Lightroom · DaVinci · Capture One · Premiere" },
    { k: "Color Recipe", v: "Temperature, HSL Matrix, Lift/Gamma/Gain" },
  ];
  return (
    <div className="cl-card p-6" data-testid="promo-block">
      <div className="cl-label mb-1">What you&apos;ll get</div>
      <h3 className="font-display text-2xl font-semibold text-slate-100 mb-5">
        The full darkroom readout
      </h3>
      <p className="sr-only">Analyze photos and videos to reveal camera, lens, and grading formulas.</p>
      <div className="space-y-3.5">
        {items.map((it) => (
          <div key={it.k} className="flex gap-3 items-start">
            <div className="mt-1 w-1.5 h-1.5 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.7)]" />
            <div className="min-w-0">
              <div className="text-sm text-slate-100 font-medium">{it.k}</div>
              <div className="text-xs text-slate-500 font-mono-tech mt-0.5">
                {it.v}
              </div>
            </div>
          </div>
        ))}
      </div>
      <button
        onClick={onSeeGallery}
        className="mt-6 text-sm text-amber-400 hover:text-amber-300 transition-colors font-medium"
        data-testid="see-gallery-link"
      >
        → Browse the community gallery
      </button>
    </div>
  );
}

function AnalyzingBlock() {
  const lines = [
    "Reading pixels …",
    "Estimating sensor + bit depth …",
    "Sampling dominant palette …",
    "Solving color grade coefficients …",
    "Writing Lightroom + DaVinci recipe …",
  ];
  return (
    <div className="cl-card p-6" data-testid="analyzing-block">
      <div className="cl-label mb-1">Working</div>
      <h3 className="font-display text-xl font-semibold text-slate-100 mb-4">
        Analyzing your frame
      </h3>
      <ul className="space-y-2.5">
        {lines.map((l, i) => (
          <li
            key={i}
            className="flex items-center gap-3 font-mono-tech text-xs text-slate-300 cl-pulse"
            style={{ animationDelay: `${i * 200}ms` }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
            {l}
          </li>
        ))}
      </ul>
    </div>
  );
}
