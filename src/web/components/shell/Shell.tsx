// App shell: sidebar (≥768 px) or bottom tab bar (phones), top bar with region switch, data date, status, theme.
import { useEffect, useState, type ReactNode } from "react";
import { ChevronUp, Ellipsis, Moon, Sun, X } from "lucide-react";
import type { RegionFilter } from "@/shared/types";
import type { PageDef } from "../../pages/types";
import { MOBILE_PAGES, NAV_GROUPS, NAV_PAGES } from "../../pages/registry";
import { useSeason } from "../../lib/appData";
import { cn } from "../../lib/cn";
import { fmtDate } from "../../lib/format";
import { usePrefs } from "../../lib/prefs";
import { Segmented } from "../ui/Segmented";
import { ServiceIndicator } from "./ServiceIndicator";
import { Wordmark } from "./Wordmark";
import { GlobalSearch } from "./GlobalSearch";
import { SiteFooter } from "./SiteFooter";

function NavItem({ page, active, variant }: { page: PageDef; active: boolean; variant: "side" | "bottom" }) {
  const Icon = page.icon;
  if (variant === "bottom")
    return (
      <a href={`#${page.navPath}`} aria-current={active ? "page" : undefined} className={bottomTab(active)}>
        <Icon className="size-5" aria-hidden />
        <span className="max-w-full truncate">{page.navLabel}</span>
      </a>
    );
  return (
    <a
      href={`#${page.navPath}`}
      aria-current={active ? "page" : undefined}
      className={cn("relative flex items-center gap-2.5 rounded-card px-3 py-2.5 font-heading text-sm font-bold transition-colors duration-300", active ? "bg-brand-soft text-brand before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:rounded-full before:bg-brand-vivid" : "text-ink hover:text-brand")}
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

const bottomTab = (active: boolean) =>
  cn("flex min-w-0 flex-1 basis-0 flex-col items-center gap-0.5 border-t-2 px-0.5 py-1.5 font-heading text-[10.5px] font-bold transition-colors duration-300", active ? "border-brand-vivid text-brand" : "border-transparent text-muted");

/** Phone bottom bar: four tabs and a "More" sheet with every page, grouped as in the sidebar. */
function BottomNav({ activeId }: { activeId: string | undefined }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const close = () => setOpen(false);
    window.addEventListener("hashchange", close);
    return () => window.removeEventListener("hashchange", close);
  }, []);
  useEffect(() => {
    if (!open) return;
    const on = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [open]);
  const inMore = !MOBILE_PAGES.some((p) => p.id === activeId);
  return (
    <>
      {open && (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="All pages">
          <button type="button" aria-label="Close" className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[80dvh] overflow-y-auto rounded-t-card border-t border-border bg-surface px-4 pb-[calc(4.5rem+env(safe-area-inset-bottom))] pt-3">
            <div className="mb-1 flex items-center justify-between">
              <span className="font-heading text-sm font-bold text-heading">All pages</span>
              <button type="button" onClick={() => setOpen(false)} className="rounded-card p-1.5 text-muted hover:bg-surface-2 hover:text-ink" aria-label="Close menu">
                <X className="size-4" />
              </button>
            </div>
            {NAV_GROUPS.map((g) => (
              <div key={g.id} className="mt-3">
                <div className="eyebrow mb-1 px-3">{g.label}</div>
                {NAV_PAGES.filter((p) => p.group === g.id).map((p) => (
                  <NavItem key={p.id} page={p} active={p.id === activeId} variant="side" />
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-50 flex border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
        {MOBILE_PAGES.map((p) => (
          <NavItem key={p.id} page={p} active={p.id === activeId && !open} variant="bottom" />
        ))}
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="dialog" className={bottomTab(open || inMore)}>
          <Ellipsis className="size-5" aria-hidden />
          <span className="max-w-full truncate">More</span>
        </button>
      </nav>
    </>
  );
}

/** "Advanced" pages: pinned to the bottom of the sidebar, collapsed unless you are on one of them. */
const COLLAPSED_GROUP = "tools";

function CollapsedNavGroup({ activeId }: { activeId: string | undefined }) {
  const group = NAV_GROUPS.find((g) => g.id === COLLAPSED_GROUP);
  const pages = NAV_PAGES.filter((p) => p.group === COLLAPSED_GROUP);
  const inside = pages.some((p) => p.id === activeId);
  const [open, setOpen] = useState(inside);
  // Opening one of its pages (e.g. from a link) unfolds the group.
  useEffect(() => {
    if (inside) setOpen(true);
  }, [inside]);
  if (!group || !pages.length) return null;
  return (
    <div className="mt-auto flex flex-col gap-0.5 border-t border-border pt-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="nav-advanced"
        className="eyebrow flex items-center justify-between rounded-card px-3 py-1.5 text-left transition-colors hover:bg-surface-2"
      >
        {group.label}
        <ChevronUp className={cn("size-3.5 transition-transform duration-200", !open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <div id="nav-advanced" className="flex flex-col gap-0.5">
          {pages.map((p) => (
            <NavItem key={p.id} page={p} active={p.id === activeId} variant="side" />
          ))}
        </div>
      )}
    </div>
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
        <div className="px-5 pb-5 pt-6">
          <Wordmark />
        </div>
        <nav aria-label="Main" className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 pb-3">
          {NAV_GROUPS.filter((g) => g.id !== COLLAPSED_GROUP).map((g) => (
            <div key={g.id} className="mt-3 flex flex-col gap-0.5 first:mt-0">
              <div className="eyebrow px-3 pb-1">{g.label}</div>
              {NAV_PAGES.filter((p) => p.group === g.id).map((p) => (
                <NavItem key={p.id} page={p} active={p.id === activeId} variant="side" />
              ))}
            </div>
          ))}
          <CollapsedNavGroup activeId={activeId} />
        </nav>
        <div className="bg-footer px-5 py-3 text-[11px] leading-snug text-footer-ink">All data is synthetic (Apetit × Since AI 2026 package)</div>
      </aside>

      <div className="md:pl-60">
        <header className="sticky top-0 z-20 border-b border-border bg-surface">
          <div className="flex flex-wrap items-center gap-3 px-4 py-3.5 sm:px-8">
            <Wordmark compact className="md:hidden" />
            <GlobalSearch className="order-last w-full sm:order-none sm:w-auto sm:min-w-0 sm:max-w-md sm:flex-1" />
            <div className="ml-auto flex items-center gap-2">
              <span className="hidden sm:inline-flex">
                <DataDateChip />
              </span>
              {/* <ServiceIndicator /> */}
              <button type="button" onClick={toggleTheme} className="rounded-card p-2 text-muted transition-colors duration-300 hover:bg-surface-2 hover:text-brand" aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}>
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
        <main id="main" className={cn("px-4 pb-10 pt-7 sm:px-8 md:pb-12", !page?.wide && "mx-auto max-w-7xl")}>
          {children}
        </main>
        <SiteFooter />
      </div>

      <BottomNav activeId={activeId} />
    </div>
  );
}
