import type { ComponentType } from "react";
import type { LucideIcon } from "lucide-react";

/** Props every page receives from the router. */
export interface PageProps {
  /** Path params from the registry pattern, e.g. { farmId: "F0001" }. */
  params: Record<string, string>;
  /** Hash query string (use setQuery() from lib/router to change it). */
  query: URLSearchParams;
}

export interface PageDef {
  id: string;
  /** Hash path pattern; ":x?" marks an optional segment. */
  path: string;
  /** Where the nav item links to (defaults to the pattern without params). */
  navPath: string;
  title: string;
  navLabel: string;
  icon: LucideIcon;
  /** Shown in the sidebar / bottom bar. */
  nav: boolean;
  /** Nav item to highlight when this page is open (e.g. Farm detail -> Live season). */
  navParent?: string;
  /** Whether the global region switch applies to this page. */
  usesRegion: boolean;
  /** Full-bleed content area (no max width), e.g. map or embeds. */
  wide?: boolean;
  component: ComponentType<PageProps>;
}
