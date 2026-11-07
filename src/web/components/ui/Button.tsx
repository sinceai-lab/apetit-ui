import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

type Variant = "primary" | "outline" | "secondary" | "ghost" | "danger";
// .btn / .btn-primary / .btn-outline live in styles.css (contrast notes there).
const V: Record<Variant, string> = {
  primary: "btn-primary",
  outline: "btn-outline",
  secondary: "border border-border bg-surface text-ink hover:border-brand-vivid hover:text-brand",
  ghost: "border border-transparent text-muted hover:bg-surface-2 hover:text-brand",
  danger: "border border-berry bg-surface text-berry hover:bg-berry-soft",
};
const base = "btn px-4 py-2 text-sm";

export function Button({ variant = "secondary", className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button type="button" className={cn(base, V[variant], className)} {...rest} />;
}

/** Anchor styled as a button; external links open in a new tab. */
export function LinkButton({ variant = "secondary", className, external, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { variant?: Variant; external?: boolean }) {
  return <a className={cn(base, V[variant], className)} {...(external ? { target: "_blank", rel: "noreferrer" } : {})} {...rest} />;
}
