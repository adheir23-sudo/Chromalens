import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, fileUrl } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { Camera, Film, Image as ImageIcon } from "lucide-react";
import { Button } from "../components/ui/button";

export default function GalleryPage() {
  const { t } = useI18n();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    const params = filter === "all" ? {} : { media_type: filter };
    api
      .get("/gallery", { params })
      .then(({ data }) => {
        if (!cancel) setItems(data.items || []);
      })
      .catch(() => !cancel && setItems([]))
      .finally(() => !cancel && setLoading(false));
    return () => {
      cancel = true;
    };
  }, [filter]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-12 pt-24 pb-24">
      <div className="flex items-end justify-between gap-4 flex-wrap mb-8 cl-rise">
        <div>
          <div className="cl-label mb-2">{t("gallery.eyebrow")}</div>
          <h1 className="font-display font-bold text-slate-100 text-3xl sm:text-4xl lg:text-5xl tracking-tight">
            {t("gallery.title")}
          </h1>
          <p className="mt-3 text-slate-400 max-w-xl">{t("gallery.sub")}</p>
        </div>
        <div className="flex gap-2" data-testid="gallery-filters">
          {[
            ["all", t("gallery.filter_all")],
            ["image", t("gallery.filter_photos")],
            ["video", t("gallery.filter_videos")],
          ].map(([k, label]) => (
            <Button
              key={k}
              variant="outline"
              onClick={() => setFilter(k)}
              data-testid={`filter-${k}`}
              className={`h-9 px-4 rounded-md text-xs font-mono-tech uppercase tracking-widest border-white/10 ${
                filter === k
                  ? "bg-amber-500/10 border-amber-500/40 text-amber-300"
                  : "bg-transparent text-slate-300 hover:bg-white/5"
              }`}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>

      {loading ? (
        <SkeletonGrid />
      ) : items.length === 0 ? (
        <EmptyState t={t} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5" data-testid="gallery-grid">
          {items.map((item, i) => (
            <GalleryCard key={item.id} item={item} idx={i} t={t} />
          ))}
        </div>
      )}
    </div>
  );
}

function GalleryCard({ item, idx, t }) {
  const tech = item.analysis?.technical || {};
  return (
    <Link
      to={`/analysis/${item.id}`}
      data-testid={`gallery-card-${item.id}`}
      className="cl-card group hover:border-amber-500/40 transition-all cl-rise block"
      style={{ animationDelay: `${idx * 45}ms` }}
    >
      <div className="aspect-[4/3] bg-black overflow-hidden relative">
        {item.media_type === "video" ? (
          <>
            <video
              src={fileUrl(item.id)}
              muted
              playsInline
              className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-700"
            />
            <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 bg-black/60 backdrop-blur rounded-md">
              <Film size={12} className="text-amber-400" />
              <span className="font-mono-tech text-[10px] text-amber-300 uppercase tracking-widest">
                {t("gallery.video_badge")}
              </span>
            </div>
          </>
        ) : (
          <>
            <img
              src={fileUrl(item.id)}
              alt={item.analysis?.title || item.original_filename}
              className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-700"
              loading="lazy"
            />
            <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 bg-black/60 backdrop-blur rounded-md">
              <ImageIcon size={12} className="text-amber-400" />
              <span className="font-mono-tech text-[10px] text-amber-300 uppercase tracking-widest">
                {t("gallery.photo_badge")}
              </span>
            </div>
          </>
        )}
      </div>
      <div className="p-4">
        <div className="font-display text-slate-100 text-base truncate">
          {item.analysis?.title || t("gallery.untitled")}
        </div>
        <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-400 truncate">
          <Camera size={12} className="text-amber-400 flex-shrink-0" />
          <span className="truncate">{tech.device || t("gallery.unknown_device")}</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {tech.software && (
            <span className="font-mono-tech text-[9px] px-2 py-0.5 uppercase tracking-widest rounded bg-white/5 border border-white/10 text-slate-300">
              {tech.software}
            </span>
          )}
          {item.analysis?.mood?.title && (
            <span className="font-mono-tech text-[9px] px-2 py-0.5 uppercase tracking-widest rounded bg-amber-500/10 border border-amber-500/20 text-amber-300">
              {item.analysis.mood.title}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="cl-card">
          <div className="aspect-[4/3] bg-white/5 cl-pulse" />
          <div className="p-4 space-y-2">
            <div className="h-4 w-2/3 bg-white/5 rounded cl-pulse" />
            <div className="h-3 w-1/2 bg-white/5 rounded cl-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ t }) {
  return (
    <div className="cl-card p-16 text-center" data-testid="gallery-empty">
      <div className="w-16 h-16 mx-auto rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-5">
        <ImageIcon size={24} className="text-amber-400" />
      </div>
      <h3 className="font-display text-xl text-slate-100 mb-2">{t("gallery.empty_title")}</h3>
      <p className="text-sm text-slate-400 mb-6">{t("gallery.empty_sub")}</p>
      <Link to="/">
        <Button className="cl-btn-primary h-11 px-6 rounded-lg" data-testid="empty-cta">
          {t("gallery.empty_cta")}
        </Button>
      </Link>
    </div>
  );
}
