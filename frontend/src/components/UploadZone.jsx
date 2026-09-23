import { useCallback, useRef, useState } from "react";
import { Upload, FileImage, Film, X } from "lucide-react";
import { Button } from "./ui/button";

export default function UploadZone({ onFileSelected, isBusy }) {
  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const inputRef = useRef(null);

  const handleFile = useCallback((f) => {
    if (!f) return;
    setSelectedFile(f);
    const url = URL.createObjectURL(f);
    setPreview({ url, name: f.name, type: f.type, size: f.size });
  }, []);

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    handleFile(f);
  };

  const reset = () => {
    if (preview?.url) URL.revokeObjectURL(preview.url);
    setPreview(null);
    setSelectedFile(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const submit = () => {
    if (selectedFile) onFileSelected(selectedFile);
  };

  return (
    <div className="cl-card p-6 sm:p-8 grain" data-testid="upload-card">
      <div className="flex items-center justify-between mb-5">
        <div>
          <div className="cl-label mb-1">01 · Input Stage</div>
          <h2 className="font-display text-2xl sm:text-3xl font-semibold text-slate-100">
            Drop a photo or clip
          </h2>
        </div>
        {preview && (
          <button
            onClick={reset}
            className="text-slate-400 hover:text-amber-300 transition-colors"
            data-testid="upload-reset-btn"
            aria-label="Reset"
          >
            <X size={20} />
          </button>
        )}
      </div>

      {!preview ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          data-testid="upload-dropzone"
          className={`relative rounded-xl border-2 border-dashed cursor-pointer transition-all duration-300 flex flex-col items-center justify-center py-16 px-6 text-center ${
            dragOver
              ? "border-amber-400 bg-amber-500/5"
              : "border-white/10 hover:border-amber-500/40 hover:bg-white/[0.02]"
          }`}
        >
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-amber-500/20 to-cyan-500/10 border border-amber-500/20 flex items-center justify-center mb-5">
            <Upload size={28} className="text-amber-400" strokeWidth={1.8} />
          </div>
          <p className="font-display text-lg text-slate-100 mb-2">
            Drop your image or video here
          </p>
          <p className="text-sm text-slate-400 max-w-md">
            Or click to browse — JPG, PNG, WEBP, MP4, MOV · up to 40 MB
          </p>
          <div className="mt-6 flex gap-4 text-[10px] font-mono-tech uppercase tracking-widest text-slate-500">
            <span className="flex items-center gap-1">
              <FileImage size={12} /> Photo
            </span>
            <span className="flex items-center gap-1">
              <Film size={12} /> Video
            </span>
          </div>
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,.mov"
            onChange={(e) => handleFile(e.target.files?.[0])}
            data-testid="upload-file-input"
          />
        </div>
      ) : (
        <div className="cl-rise">
          <div className="rounded-xl overflow-hidden bg-black border border-white/10 aspect-video flex items-center justify-center">
            {preview.type.startsWith("video/") ? (
              <video
                src={preview.url}
                controls
                className="max-h-full max-w-full"
                data-testid="upload-preview-video"
              />
            ) : (
              <img
                src={preview.url}
                alt={preview.name}
                className="max-h-full max-w-full object-contain"
                data-testid="upload-preview-image"
              />
            )}
          </div>

          <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="font-mono-tech text-xs text-slate-400 truncate">
              <span className="text-slate-500">FILE · </span>
              <span className="text-slate-200">{preview.name}</span>
              <span className="text-slate-600"> · </span>
              <span className="text-cyan-300">
                {(preview.size / (1024 * 1024)).toFixed(2)} MB
              </span>
            </div>
            <Button
              onClick={submit}
              disabled={isBusy}
              className="cl-btn-primary h-11 px-6 rounded-lg"
              data-testid="analyze-submit-btn"
            >
              {isBusy ? (
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#0A0C10] cl-pulse" />
                  Analyzing…
                </span>
              ) : (
                "Reveal the Formula"
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
