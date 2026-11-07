import { createContext, useState, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "../../lib/cn";

/** A panel's header action slot, so a chart/table toggle inside the body can sit on the title row instead of its own line.
 *  `owner` lets only the first toggle in a panel claim it. */
export const PanelActionSlot = createContext<{ el: HTMLElement | null; owner: { current: string | null } } | null>(null);

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <section className={cn("rounded-card border border-border bg-surface shadow-card", className)} {...rest} />;
}

/** Card with a title row (title, optional subtitle, right-side actions) and padded body. */
export function Panel({ title, subtitle, actions, children, className, bodyClassName, id }: { title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string; id?: string }) {
  const [slotEl, setSlotEl] = useState<HTMLElement | null>(null);
  const [owner] = useState<{ current: string | null }>(() => ({ current: null }));
  const hasHeader = Boolean(title || actions);
  return (
    <Card className={className} id={id}>
      {hasHeader && (
        <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-6 pt-5">
          <div className="min-w-0 flex-1 basis-60">
            {title && <h2 className="font-display text-lg font-bold leading-tight text-heading">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p>}
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {actions}
            <span ref={setSlotEl} className="contents" />
          </div>
        </header>
      )}
      <PanelActionSlot.Provider value={hasHeader ? { el: slotEl, owner } : null}>
        <div className={cn("px-6 pb-6 pt-5", bodyClassName)}>{children}</div>
      </PanelActionSlot.Provider>
    </Card>
  );
}

/** Page heading used at the top of every page. */
/** `below` renders right under the subtitle (e.g. a filter row), still part of the header block. */
export function PageHeader({ title, subtitle, actions, below }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; below?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0 flex-1 basis-[28rem]">
        <h1 className="font-title text-2xl font-semibold text-heading sm:text-[32px] sm:leading-tight">{title}</h1>
        {subtitle && <p className="mt-1.5 max-w-3xl text-[15px] text-muted">{subtitle}</p>}
        {below && <div className="mt-4">{below}</div>}
      </div>
      {actions && <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
