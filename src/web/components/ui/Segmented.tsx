import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

export interface SegOption<T extends string> {
  value: T;
  label: ReactNode;
  title?: string;
}

/** Radio-group style segmented control. */
export function Segmented<T extends string>({ value, onChange, options, ariaLabel, size = "md", className }: { value: T; onChange: (v: T) => void; options: SegOption<T>[]; ariaLabel: string; size?: "sm" | "md"; className?: string }) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cn("inline-flex max-w-full gap-1 overflow-x-auto rounded-card border border-border bg-surface-2 p-1", className)}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            title={o.title}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[3px] border font-medium transition-colors duration-150",
              size === "sm" ? "px-3 py-1 text-xs" : "px-4 py-1.5 text-sm",
              on ? "seg-on" : "seg-off",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
