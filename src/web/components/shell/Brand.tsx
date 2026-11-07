// Apetit brand images (see assets/brand/README.md: trademarks, demo use only).
import { cn } from "../../lib/cn";
import aMark from "../../assets/brand/a-mark-192x192.png";
import logo from "../../assets/brand/logo-apetit.png";

export const BRAND_LOGO = logo;

/** The green slanted "A" mark, used as the assistant avatar and in headers. */
export function AMark({ className, label }: { className?: string; label?: string }) {
  return <img src={aMark} alt={label ?? ""} aria-hidden={label ? undefined : true} width={192} height={192} className={cn("size-6 select-none object-contain", className)} draggable={false} />;
}
