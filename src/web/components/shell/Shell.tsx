// App shell: sidebar (≥768 px) or bottom tab bar (phones), top bar with region switch, data date, status, theme.
import type { ReactNode } from "react";
import { Moon, Sun } from "lucide-react";
import type { RegionFilter } from "@/shared/types";
import type { PageDef } from "../../pages/types";
import { NAV_PAGES } from "../../pages/registry";
import { useSeason } from "../../lib/appData";
import { cn } from "../../lib/cn";
import { fmtDate } from "../../lib/format";
import { usePrefs } from "../../lib/prefs";
import { Segmented } from "../ui/Segmented";
import { ServiceIndicator } from "./ServiceIndicator";
import { Wordmark } from "./Wordmark";

function NavItem({ page, active, variant }: { page: PageDef; active: boolean; variant: "side" | "bottom" }) {
  const Icon = page.icon;
  if (variant === "bottom")
    return (
      <a href={`#${page.navPath}`} aria-current={active ? "page" : undefined} className={cn("flex min-w-0 flex-1 basis-0 flex-col items-center gap-0.5 border-t-2 px-0.5 py-1.5 font-heading text-[10.5px] font-bold transition-colors duration-300", active ? "border-brand-vivid text-brand" : "border-transparent text-muted")}>
        <Icon className="size-5" aria-hidden />
        <span className="max-w-full truncate">{page.navLabel}</span>
      </a>
    );
  return (
    <a
      href={`#${page.navPath}`}
      aria-current={active ? "page" : undefined}
      className={cn("relative flex items-center gap-2.5 rounded-card px-3 py-2 font-heading text-sm font-bold transition-colors duration-300", active ? "bg-brand-soft text-brand before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:rounded-full before:bg-brand-vivid" : "text-ink hover:text-brand")}
    >
      <Icon className={cn("size-4", active ? "text-brand-vivid" : "text-muted")} aria-hidden />
      {page.title}
    </a>
  );
}

export function DataDateChip({ className }: { className?: string }) {
  const s = useSeason();
  if (!s?.year) return null;
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-card bg-rapeseed-soft px-2.5 py-1 text-xs font-medium text-ink", className)} title="Dates are the simulated season's own dates, not today's date">
      Season {s.year}
      {s.asOfDate && <span className="text-muted">· data as of {fmtDate(s.asOfDate)}</span>}
    </span>
  );
}

const REGION_OPTS: { value: RegionFilter; label: string }[] = [
  { value: "FI_SW", label: "Finland" },
  { value: "SE_SKANE", label: "Sweden" },
  { value: "both", label: "Both" },
];

export function Shell({ page, children }: { page: PageDef | null; children: ReactNode }) {
  const { region, setRegion, theme, toggleTheme } = usePrefs();
  const activeId = page?.navParent ?? page?.id;
  return (
    <div className="min-h-dvh bg-bg text-ink">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-border bg-surface md:flex">
        <div className="px-5 pb-4 pt-5">
          <Wordmark />
        </div>
        <nav aria-label="Main" className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3">
          {NAV_PAGES.map((p) => (
            <NavItem key={p.id} page={p} active={p.id === activeId} variant="side" />
          ))}
        </nav>
        <div className="bg-footer px-5 py-3 text-[11px] leading-snug text-footer-ink">All data is synthetic (Apetit × Since AI 2026 package)</div>
      </aside>

      <div className="md:pl-60">
        <header className="sticky top-0 z-20 border-b border-border bg-bg/95 backdrop-blur">
          <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 sm:px-6">
            <Wordmark compact className="md:hidden" />
            <div className="hidden min-w-0 font-heading text-sm font-bold text-heading md:block">{page?.title}</div>
            <div className="ml-auto flex items-center gap-2">
              <span className="hidden sm:inline-flex">
                <DataDateChip />
              </span>
              <ServiceIndicator />
              <button type="button" onClick={toggleTheme} className="rounded-card p-1.5 text-muted transition-colors duration-300 hover:bg-surface-2 hover:text-brand" aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}>
                {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
              </button>
            </div>
            {page?.usesRegion && (
              <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto md:order-none">
                <Segmented size="sm" ariaLabel="Region" value={region} onChange={setRegion} options={REGION_OPTS} />
                <span className="sm:hidden">
                  <DataDateChip />
                </span>
              </div>
            )}
          </div>
        </header>
        <main id="main" className={cn("px-4 pb-24 pt-5 sm:px-6 md:pb-10", !page?.wide && "mx-auto max-w-7xl")}>
          {children}
        </main>
        <footer className="px-4 pb-24 text-center text-[11px] text-muted md:hidden">All data is synthetic (Apetit × Since AI 2026 package)</footer>
      </div>

      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
        {NAV_PAGES.map((p) => (
          <NavItem key={p.id} page={p} active={p.id === activeId} variant="bottom" />
        ))}
      </nav>
    </div>
  );
}
