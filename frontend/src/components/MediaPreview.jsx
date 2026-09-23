import { fileUrl } from "../lib/api";

export default function MediaPreview({ record }) {
  if (!record) return null;
  const src = fileUrl(record.id);
  return (
    <div className="cl-card overflow-hidden" data-testid="media-preview">
      <div className="aspect-video bg-black flex items-center justify-center relative">
        {record.media_type === "video" ? (
          <video
            src={src}
            controls
            className="w-full h-full object-contain"
            data-testid="preview-video"
          />
        ) : (
          <img
            src={src}
            alt={record.analysis?.title || record.original_filename}
            className="w-full h-full object-contain"
            data-testid="preview-image"
          />
        )}
      </div>
      <div className="p-4 flex items-center justify-between gap-3 border-t border-white/5">
        <div className="min-w-0">
          <div className="cl-label mb-0.5">Frame Title</div>
          <div className="font-display text-slate-100 text-base truncate">
            {record.analysis?.title || record.original_filename}
          </div>
        </div>
        <span className="font-mono-tech text-[10px] uppercase tracking-widest px-2.5 py-1 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
          {record.media_type}
        </span>
      </div>
    </div>
  );
}
