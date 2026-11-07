// Hash router: "#/farm/F0001?tab=x". Patterns use ":param" and optional ":param?" segments.
import { useEffect, useState, type AnchorHTMLAttributes, type MouseEvent } from "react";

export interface Location {
  path: string;
  query: URLSearchParams;
}

export function readLocation(hash = typeof location !== "undefined" ? location.hash : ""): Location {
  const raw = hash.replace(/^#/, "") || "/";
  const [p = "/", q = ""] = raw.split("?");
  const path = "/" + p.replace(/^\/+/, "").replace(/\/+$/, "");
  return { path, query: new URLSearchParams(q) };
}

export function useLocation(): Location {
  const [loc, setLoc] = useState(readLocation);
  useEffect(() => {
    const on = () => setLoc(readLocation());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return loc;
}

/** Build an href: href("/farm/F0001", {tab: "parcels"}) -> "#/farm/F0001?tab=parcels". */
export function href(path: string, query?: Record<string, string | number | null | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {})) if (v != null && v !== "") p.set(k, String(v));
  const s = p.toString();
  return `#${path.startsWith("/") ? path : `/${path}`}${s ? `?${s}` : ""}`;
}

export function navigate(path: string, query?: Record<string, string | number | null | undefined>, opts: { replace?: boolean } = {}) {
  const h = href(path, query);
  if (opts.replace) history.replaceState(null, "", h), window.dispatchEvent(new HashChangeEvent("hashchange"));
  else location.hash = h;
}

/** Update only the query string of the current route (e.g. a tab or filter). */
export function setQuery(patch: Record<string, string | number | null | undefined>, opts: { replace?: boolean } = { replace: true }) {
  const { path, query } = readLocation();
  const next: Record<string, string> = Object.fromEntries(query.entries());
  for (const [k, v] of Object.entries(patch)) {
    if (v == null || v === "") delete next[k];
    else next[k] = String(v);
  }
  navigate(path, next, opts);
}

export function matchPath(pattern: string, path: string): Record<string, string> | null {
  const a = pattern.split("/").filter(Boolean);
  const b = path.split("/").filter(Boolean);
  const params: Record<string, string> = {};
  let i = 0;
  for (; i < a.length; i++) {
    const seg = a[i]!;
    const opt = seg.endsWith("?");
    if (seg.startsWith(":")) {
      const name = seg.slice(1, opt ? -1 : undefined);
      if (b[i] == null) {
        if (opt) continue;
        return null;
      }
      params[name] = decodeURIComponent(b[i]!);
    } else if (seg !== b[i]) return null;
  }
  return b.length <= a.length ? params : null;
}

export function Link({ to, query, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string; query?: Record<string, string | number | null | undefined> }) {
  return (
    <a
      href={href(to, query)}
      onClick={(e: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(e);
      }}
      {...rest}
    />
  );
}
