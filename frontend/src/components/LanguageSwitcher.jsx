import { Globe, Check } from "lucide-react";
import { useI18n } from "../lib/i18n";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from "./ui/dropdown-menu";

export default function LanguageSwitcher({ variant = "header" }) {
  const { lang, setLang, languages, t } = useI18n();
  const current = languages.find((l) => l.code === lang) || languages[0];

  if (variant === "settings") {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" data-testid="language-grid">
        {languages.map((l) => {
          const active = l.code === lang;
          return (
            <button
              key={l.code}
              onClick={() => setLang(l.code)}
              data-testid={`lang-${l.code}`}
              className={`flex items-center justify-between gap-3 px-4 py-3 rounded-lg border transition-all text-left ${
                active
                  ? "border-amber-500/50 bg-amber-500/10 text-amber-200"
                  : "border-white/10 bg-white/[0.02] hover:bg-white/5 text-slate-200"
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-xl leading-none flex-shrink-0" aria-hidden>{l.flag}</span>
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{l.native}</div>
                  <div className="text-[10px] font-mono-tech uppercase tracking-widest text-slate-500 truncate">
                    {l.name} · {l.code}
                  </div>
                </div>
              </div>
              {active && <Check size={16} className="text-amber-300 flex-shrink-0" />}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t("header.change_language")}
          data-testid="header-language-btn"
          className="h-9 px-2.5 rounded-md text-slate-300 hover:text-amber-300 hover:bg-white/5 transition-colors flex items-center gap-1.5"
        >
          <Globe size={16} strokeWidth={1.8} />
          <span className="hidden sm:inline font-mono-tech text-[10px] uppercase tracking-widest">
            {current.code}
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="bg-[#12151E] border-white/10 text-slate-200 min-w-[200px]"
        data-testid="language-menu"
      >
        <DropdownMenuLabel className="text-[10px] font-mono-tech uppercase tracking-widest text-slate-500">
          {t("header.change_language")}
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-white/5" />
        {languages.map((l) => (
          <DropdownMenuItem
            key={l.code}
            onSelect={() => setLang(l.code)}
            data-testid={`lang-item-${l.code}`}
            className={`cursor-pointer flex items-center gap-2 ${
              l.code === lang ? "text-amber-300 bg-amber-500/10" : ""
            }`}
          >
            <span className="text-base leading-none" aria-hidden>{l.flag}</span>
            <span className="flex-1">{l.native}</span>
            {l.code === lang && <Check size={14} />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
