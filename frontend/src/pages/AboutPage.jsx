import { Aperture, Camera, Film, Layers } from "lucide-react";

export default function AboutPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-8 pt-24 pb-24">
      <div className="cl-label mb-3">The Manual</div>
      <h1 className="font-display font-bold text-slate-100 text-4xl sm:text-5xl tracking-tight">
        A darkroom you can read.
      </h1>
      <p className="mt-5 text-slate-300 text-base leading-relaxed">
        ChromaLens AI is a learning tool for photographers, colorists, and
        filmmakers. Upload a shot you love and it reverse-engineers the
        camera, format, and color grade so you can study — and reproduce — the
        exact recipe in Lightroom or DaVinci Resolve.
      </p>

      <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-5">
        {[
          [Camera, "Technical Telemetry", "Camera body, lens, ISO, aperture and shutter — reasoned from the pixels."],
          [Layers, "Format Details", "Resolution, megapixels, bit depth, and frame rate for video clips."],
          [Aperture, "Grade Recipe", "Lightroom values plus DaVinci lift / gamma / gain / offset ready to copy."],
          [Film, "Public Gallery", "Every analyzed frame becomes a reference for the community."],
        ].map(([Icon, t, d], i) => (
          <div key={i} className="cl-card p-5">
            <div className="w-10 h-10 rounded-md bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-3">
              <Icon size={18} className="text-amber-400" />
            </div>
            <div className="font-display text-lg text-slate-100">{t}</div>
            <p className="text-sm text-slate-400 mt-1.5 leading-relaxed">{d}</p>
          </div>
        ))}
      </div>

      <div className="mt-12 cl-card p-6">
        <div className="cl-label mb-2">A note on estimates</div>
        <p className="text-sm text-slate-400 leading-relaxed">
          ChromaLens infers technical details and color grading formulas from
          the visual content itself. It is a study aid, not a forensic tool —
          treat every recipe as a strong starting point you can dial in by eye.
        </p>
      </div>
    </div>
  );
}
