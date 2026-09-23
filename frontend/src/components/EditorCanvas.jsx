import { useEffect, useRef } from "react";
import { applyGradeToImageData } from "../lib/grade";

/**
 * Real-time canvas preview that applies grade params to a source image.
 * Downscales to `maxSide` for interactive performance.
 */
export default function EditorCanvas({ image, params, maxSide = 900 }) {
  const canvasRef = useRef(null);
  const sourceRef = useRef({ imageData: null, w: 0, h: 0 });

  // (Re)build source ImageData when the image changes
  useEffect(() => {
    if (!image) return;
    const off = document.createElement("canvas");
    const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
    const w = Math.max(1, Math.round(image.width * scale));
    const h = Math.max(1, Math.round(image.height * scale));
    off.width = w;
    off.height = h;
    const ctx = off.getContext("2d");
    ctx.drawImage(image, 0, 0, w, h);
    sourceRef.current = { imageData: ctx.getImageData(0, 0, w, h), w, h };

    const canvas = canvasRef.current;
    if (canvas) {
      canvas.width = w;
      canvas.height = h;
    }
    render();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image, maxSide]);

  // Re-render on params change (rAF debounced)
  useEffect(() => {
    let raf = 0;
    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  function render() {
    const canvas = canvasRef.current;
    const src = sourceRef.current;
    if (!canvas || !src.imageData) return;
    const ctx = canvas.getContext("2d");
    // Copy source into working ImageData
    const work = new ImageData(
      new Uint8ClampedArray(src.imageData.data),
      src.w,
      src.h
    );
    applyGradeToImageData(work, params);
    ctx.putImageData(work, 0, 0);
  }

  return (
    <div className="w-full h-full flex items-center justify-center bg-black/80">
      <canvas
        ref={canvasRef}
        data-testid="editor-canvas"
        className="max-w-full max-h-full object-contain shadow-[0_20px_80px_-20px_rgba(0,0,0,0.9)]"
      />
    </div>
  );
}
