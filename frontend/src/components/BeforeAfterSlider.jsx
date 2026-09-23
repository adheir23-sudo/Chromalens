import { useCallback, useEffect, useRef, useState } from "react";
import { API, fileUrl } from "../lib/api";
import { ChevronsLeftRight, Loader2 } from "lucide-react";

export default function BeforeAfterSlider({ record }) {
  const containerRef = useRef(null);
  const [pos, setPos] = useState(50); // 0-100 %
  const [afterLoaded, setAfterLoaded] = useState(false);
  const [afterError, setAfterError] = useState(false);
  const [dragging, setDragging] = useState(false);

  const src = fileUrl(record.id);
  const graded = `${API}/preview/${record.id}`;

  const updateFromEvent = useCallback((clientX) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const p = ((clientX - rect.left) / rect.width) * 100;
    setPos(Math.max(0, Math.min(100, p)));
  }, []);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e) => {
      const x = e.touches ? e.touches[0].clientX : e.clientX;
      updateFromEvent(x);
    };
    const stop = () => setDragging(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("touchmove", onMove);
    window.addEventListener("mouseup", stop);
    window.addEventListener("touchend", stop);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("mouseup", stop);
      window.removeEventListener("touchend", stop);
    };
  }, [dragging, updateFromEvent]);

  const start = (e) => {
    setDragging(true);
    const x = e.touches ? e.touches[0].clientX : e.clientX;
    updateFromEvent(x);
  };

  if (record.media_type !== "image") return null;

  return (
    <div className="cl-card p-6" data-testid="before-after-slider">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div>
          <div className="cl-label mb-1">02.5 · A/B Compare</div>
          <h3 className="font-display text-xl font-semibold text-slate-100">
            See the recipe working
          </h3>
          <p className="text-sm text-slate-400 mt-1 max-w-xl">
            Drag the handle to reveal the graded preview built from the
            extracted Lightroom formula.
          </p>
        </div>
        <div className="flex items-center gap-2 text-[10px] font-mono-tech uppercase tracking-widest text-slate-500">
          <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
          Before
          <span className="mx-2 text-slate-600">·</span>
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.7)]" />
          After
        </div>
      </div>

      <div
        ref={containerRef}
        onMouseDown={start}
        onTouchStart={start}
        className="relative w-full aspect-video overflow-hidden rounded-lg select-none bg-black cursor-ew-resize"
        data-testid="ab-frame"
      >
        {/* Original (BEFORE) — bottom layer */}
        <img
          src={src}
          alt="Original"
          draggable="false"
          className="absolute inset-0 w-full h-full object-contain pointer-events-none"
        />
        <span className="absolute top-3 left-3 px-2 py-1 rounded bg-black/60 backdrop-blur font-mono-tech text-[10px] uppercase tracking-widest text-slate-300 pointer-events-none">
          Before
        </span>

        {/* Graded (AFTER) — clipped by cursor */}
        <div
          className="absolute inset-0 overflow-hidden pointer-events-none"
          style={{ clipPath: `inset(0 0 0 ${pos}%)` }}
        >
          {!afterError && (
            <img
              src={graded}
              alt="Graded preview"
              draggable="false"
              onLoad={() => setAfterLoaded(true)}
              onError={() => setAfterError(true)}
              className="absolute inset-0 w-full h-full object-contain"
              data-testid="ab-after-img"
            />
          )}
          <span className="absolute top-3 right-3 px-2 py-1 rounded bg-amber-500/20 backdrop-blur font-mono-tech text-[10px] uppercase tracking-widest text-amber-200 border border-amber-500/30">
            After · ChromaLens
          </span>
        </div>

        {/* Loading state */}
        {!afterLoaded && !afterError && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-black/70 rounded-md">
              <Loader2 size={14} className="text-amber-400 animate-spin" />
              <span className="font-mono-tech text-[10px] uppercase tracking-widest text-amber-300">
                Rendering graded preview…
              </span>
            </div>
          </div>
        )}

        {/* Divider + handle */}
        <div
          className="absolute top-0 bottom-0 pointer-events-none"
          style={{ left: `${pos}%`, transform: "translateX(-50%)" }}
        >
          <div className="h-full w-[2px] bg-white/90 shadow-[0_0_16px_rgba(255,255,255,0.5)]" />
        </div>
        <button
          type="button"
          aria-label="Drag to compare"
          data-testid="ab-handle"
          className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full bg-amber-400 text-[#0A0C10] flex items-center justify-center shadow-[0_0_24px_rgba(245,158,11,0.7)] ring-4 ring-[#0A0C10]/60 hover:scale-105 transition-transform"
          style={{ left: `${pos}%` }}
          onMouseDown={start}
          onTouchStart={start}
        >
          <ChevronsLeftRight size={18} strokeWidth={2.5} />
        </button>

        {afterError && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70">
            <span className="text-sm text-slate-300 font-mono-tech">
              Could not render preview
            </span>
          </div>
        )}
      </div>

      {/* Position readout */}
      <div className="mt-3 flex items-center justify-between font-mono-tech text-[10px] uppercase tracking-widest text-slate-500">
        <span>0% · Original</span>
        <span className="text-amber-400">Reveal · {Math.round(pos)}%</span>
        <span>100% · Graded</span>
      </div>
    </div>
  );
}
