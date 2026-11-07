// Right-side panel (map details, provenance source drawer). Full-width sheet on phones.
import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

export function Drawer({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const on = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [open, onClose]);
  if (!open) return null;
  // Portalled to <body> so it also opens above the floating chat panel.
  return createPortal(
    <div data-drawer className="fixed inset-0 z-[60] flex justify-end" role="dialog" aria-modal="true">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/30" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-lg flex-col border-l border-border bg-surface shadow-xl">
        <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h2 className="font-display truncate text-lg font-bold text-heading">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-card p-1.5 text-muted hover:bg-surface-2 hover:text-ink" aria-label="Close panel">
            <X className="size-4" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
      </aside>
    </div>,
    document.body,
  );
}

/** Pretty-printed JSON block. */
export function JsonBlock({ value, maxHeight = 480 }: { value: unknown; maxHeight?: number }) {
  return (
    <pre className="overflow-auto rounded-card bg-surface-2 p-3 text-xs leading-relaxed text-ink" style={{ maxHeight }}>
      {typeof value === "string" ? value : JSON.stringify(value, null, 2)}
    </pre>
  );
}
