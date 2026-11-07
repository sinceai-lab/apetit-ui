// Page footer: link out to apetit.com and the synthetic-data notice. Extra bottom padding on phones clears the tab bar.
import { ExternalLink } from "lucide-react";
import { BRAND_LOGO } from "./Brand";

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-surface px-4 pb-24 pt-6 sm:px-8 md:pb-6">
      <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-3">
        <a href="https://apetit.com" target="_blank" rel="noreferrer" className="group inline-flex items-center gap-3 no-underline" aria-label="Apetit website (opens in a new tab)">
          <img src={BRAND_LOGO} alt="" width={220} height={100} className="h-7 w-auto select-none" draggable={false} />
          <span className="inline-flex items-center gap-1 text-sm font-medium text-brand group-hover:text-brand-strong group-hover:underline">
            apetit.com
            <ExternalLink className="size-3.5" aria-hidden />
          </span>
        </a>
        <p className="text-xs text-muted">All data is synthetic (Apetit × Since AI 2026 package)</p>
      </div>
    </footer>
  );
}
