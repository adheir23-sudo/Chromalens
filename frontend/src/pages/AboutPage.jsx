import { Aperture, Camera, Film, Layers } from "lucide-react";
import { useI18n } from "../lib/i18n";

export default function AboutPage() {
  const { t } = useI18n();
  const cards = [
    [Camera, t("about.tech_t"), t("about.tech_d")],
    [Layers, t("about.format_t"), t("about.format_d")],
    [Aperture, t("about.recipe_t"), t("about.recipe_d")],
    [Film, t("about.gallery_t"), t("about.gallery_d")],
  ];
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-8 pt-24 pb-24">
      <div className="cl-label mb-3">{t("about.eyebrow")}</div>
      <h1 className="font-display font-bold text-slate-100 text-4xl sm:text-5xl tracking-tight">
        {t("about.title")}
      </h1>
      <p className="mt-5 text-slate-300 text-base leading-relaxed">
        {t("about.lead")}
      </p>

      <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-5">
        {cards.map(([Icon, title, desc], i) => (
          <div key={i} className="cl-card p-5">
            <div className="w-10 h-10 rounded-md bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-3">
              <Icon size={18} className="text-amber-400" />
            </div>
            <div className="font-display text-lg text-slate-100">{title}</div>
            <p className="text-sm text-slate-400 mt-1.5 leading-relaxed">{desc}</p>
          </div>
        ))}
      </div>

      <div className="mt-12 cl-card p-6">
        <div className="cl-label mb-2">{t("about.note_eyebrow")}</div>
        <p className="text-sm text-slate-400 leading-relaxed">
          {t("about.note_body")}
        </p>
      </div>
    </div>
  );
}
