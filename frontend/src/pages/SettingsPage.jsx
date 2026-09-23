import { useI18n } from "../lib/i18n";
import LanguageSwitcher from "../components/LanguageSwitcher";

export default function SettingsPage() {
  const { t } = useI18n();
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-8 pt-24 pb-24">
      <div className="cl-label mb-3">{t("settings.title")}</div>
      <h1 className="font-display font-bold text-slate-100 text-4xl sm:text-5xl tracking-tight">
        {t("settings.sub")}
      </h1>

      <div className="mt-10 cl-card p-6">
        <div className="cl-label mb-1">{t("settings.language_eyebrow")}</div>
        <h2 className="font-display text-xl text-slate-100 mb-1">
          {t("settings.language_title")}
        </h2>
        <p className="text-sm text-slate-400 leading-relaxed mb-6 max-w-xl">
          {t("settings.language_desc")}
        </p>
        <LanguageSwitcher variant="settings" />
      </div>
    </div>
  );
}
