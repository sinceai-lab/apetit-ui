import { useLayoutEffect, useRef, useState, type RefObject } from "react";

// Measures an element's content width with ResizeObserver; charts render their SVG at this width.
// Usage: const [ref, width] = useMeasure(); <div ref={ref}>{width > 0 && <svg width={width} />}</div>
export function useMeasure<T extends HTMLElement = HTMLDivElement>(): [RefObject<T | null>, number] {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(Math.floor(el.getBoundingClientRect().width));
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const w = Math.floor(entries[0]?.contentRect.width ?? 0);
      setWidth((prev) => (prev === w ? prev : w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}
