import { cn } from "../../lib/cn";
import { BRAND_LOGO } from "./Brand";

/** Apetit script wordmark (green on transparent, readable in both themes) + product name. */
export function Wordmark({ compact, className }: { compact?: boolean; className?: string }) {
  return (
    <a href="#/" className={cn("inline-flex items-end gap-2 no-underline", className)} aria-label="Apetit Farm insights, home">
      <img src={BRAND_LOGO} alt="" width={220} height={100} className={cn("w-auto select-none", compact ? "h-7" : "h-9")} draggable={false} />
      {!compact && <span className="pb-0.5 font-heading text-[13px] font-bold uppercase tracking-[0.06em] text-heading">Farm insights</span>}
    </a>
  );
}
