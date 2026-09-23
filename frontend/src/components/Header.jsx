import { NavLink, Link } from "react-router-dom";
import { Aperture } from "lucide-react";

export default function Header() {
  const linkCls = ({ isActive }) =>
    `px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
      isActive
        ? "text-amber-400 bg-white/5"
        : "text-slate-300 hover:text-amber-300 hover:bg-white/5"
    }`;

  return (
    <header
      data-testid="app-header"
      className="fixed top-0 inset-x-0 z-50 bg-[#0A0C10]/85 backdrop-blur-xl border-b border-white/10"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-12 h-16 flex items-center justify-between">
        <Link
          to="/"
          className="flex items-center gap-3 group"
          data-testid="header-logo"
        >
          <div className="relative w-9 h-9 rounded-lg bg-gradient-to-br from-amber-500/20 to-cyan-500/10 border border-amber-500/30 flex items-center justify-center">
            <Aperture
              size={20}
              className="text-amber-400 aperture-spin"
              strokeWidth={2}
            />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="font-display font-bold text-slate-100 text-base tracking-tight">
              ChromaLens
            </span>
            <span className="font-mono-tech text-[9px] uppercase tracking-[0.2em] text-amber-400/80">
              AI · v1.0
            </span>
          </div>
        </Link>

        <nav className="flex items-center gap-1">
          <NavLink to="/" end className={linkCls} data-testid="nav-analyzer">
            Analyzer
          </NavLink>
          <NavLink to="/gallery" className={linkCls} data-testid="nav-gallery">
            Gallery
          </NavLink>
          <NavLink to="/about" className={linkCls} data-testid="nav-about">
            About
          </NavLink>
        </nav>

        <div className="hidden md:flex items-center gap-2 font-mono-tech text-[10px] uppercase tracking-widest text-slate-500">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span>Gemini 3.1 Pro · Online</span>
        </div>
      </div>
    </header>
  );
}
