import { Camera, Aperture, Monitor, Zap, Layers, Clock, Focus, Gauge, Film, Wand2 } from "lucide-react";

const rows = [
  { key: "device", label: "Device", icon: Camera },
  { key: "lens", label: "Lens", icon: Focus },
  { key: "resolution", label: "Resolution", icon: Monitor },
  { key: "megapixels", label: "Megapixels", icon: Layers },
  { key: "bit_depth", label: "Bit Depth", icon: Gauge },
  { key: "iso", label: "ISO", icon: Zap },
  { key: "aperture", label: "Aperture", icon: Aperture },
  { key: "shutter", label: "Shutter", icon: Clock },
  { key: "focal_length", label: "Focal Length", icon: Focus },
  { key: "fps", label: "Frame Rate", icon: Film },
  { key: "software", label: "Software", icon: Wand2 },
];

export default function TechnicalPanel({ technical }) {
  if (!technical) return null;
  return (
    <div className="cl-card p-6" data-testid="technical-panel">
      <div className="cl-label mb-1">02 · Technical Telemetry</div>
      <h3 className="font-display text-xl font-semibold text-slate-100 mb-5">
        Shot Metadata
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
        {rows.map(({ key, label, icon: Icon }) => {
          const val = technical[key];
          if (!val || val === "n/a") return null;
          return (
            <div
              key={key}
              className="flex items-start gap-3 py-2 border-b border-white/5"
              data-testid={`tech-${key}`}
            >
              <div className="mt-0.5 w-7 h-7 rounded-md bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0">
                <Icon size={14} className="text-amber-400" strokeWidth={1.8} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="cl-label text-[9px]">{label}</div>
                <div className="cl-data truncate" title={val}>
                  {val}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
