// Every page in the contract IA (§6, §10.3). Shared file: pages are filled in their own files, not here.
import { BadgeCheck, Bot, CloudSun, Database, FlaskConical, Gauge, LayoutDashboard, Map as MapIcon, Server, ShieldAlert, Sprout, Tractor, TrendingUp } from "lucide-react";
import type { NavGroup, PageDef } from "./types";
import { OverviewPage } from "./Overview";
import { SeasonPage } from "./Season";
import { MapPage } from "./Map";
import { FarmPage } from "./Farm";
import { WeatherPage } from "./Weather";
import { OutlookPage } from "./Outlook";
import { AdvicePage } from "./Advice";
import { TryPage } from "./Try";
import { TrustPage } from "./Trust";
import { AssistantPage } from "./Assistant";
import { DataPage } from "./Data";
import { ServicesPage } from "./Services";

export type { NavGroup, PageDef, PageProps } from "./types";

export const PAGES: PageDef[] = [
  { id: "overview", path: "/", navPath: "/", title: "Overview", navLabel: "Overview", icon: LayoutDashboard, nav: true, group: "season", mobile: true, usesRegion: true, component: OverviewPage },
  { id: "season", path: "/season", navPath: "/season", title: "Live season", navLabel: "Season", icon: Sprout, nav: true, group: "season", mobile: true, usesRegion: true, component: SeasonPage },
  { id: "map", path: "/map", navPath: "/map", title: "Map", navLabel: "Map", icon: MapIcon, nav: true, group: "season", mobile: true, usesRegion: true, wide: true, component: MapPage },
  { id: "farm", path: "/farm/:farmId?", navPath: "/farm", title: "Farm detail", navLabel: "Farm", icon: Tractor, nav: false, navParent: "season", usesRegion: false, component: FarmPage },
  { id: "weather", path: "/weather/:cellId?", navPath: "/weather", title: "Weather", navLabel: "Weather", icon: CloudSun, nav: true, group: "season", usesRegion: true, component: WeatherPage },
  { id: "outlook", path: "/outlook", navPath: "/outlook", title: "Forecast", navLabel: "Forecast", icon: TrendingUp, nav: true, group: "planning", usesRegion: true, component: OutlookPage },
  { id: "advice", path: "/advice", navPath: "/advice", title: "Risk & advice", navLabel: "Advice", icon: ShieldAlert, nav: true, group: "planning", mobile: true, usesRegion: true, component: AdvicePage },
  { id: "assistant", path: "/assistant", navPath: "/assistant", title: "Assistant", navLabel: "Assistant", icon: Bot, nav: false, group: "tools", usesRegion: false, component: AssistantPage },
  { id: "data", path: "/data", navPath: "/data", title: "Data & provenance", navLabel: "Data", icon: Database, nav: true, group: "tools", usesRegion: false, component: DataPage },
  { id: "services", path: "/services/:embed?", navPath: "/services", title: "Services", navLabel: "Services", icon: Server, nav: true, group: "tools", usesRegion: false, wide: true, component: ServicesPage },
  { id: "try", path: "/try", navPath: "/try", title: "Try the model", navLabel: "Try it", icon: FlaskConical, nav: true, group: "tools", usesRegion: true, component: TryPage },
  { id: "trust", path: "/trust", navPath: "/trust", title: "Model trust", navLabel: "Trust", icon: BadgeCheck, nav: true, group: "tools", usesRegion: false, component: TrustPage },
];

export const NAV_GROUPS: { id: NavGroup; label: string }[] = [
  { id: "season", label: "This season" },
  { id: "planning", label: "Climate & planning" },
  { id: "tools", label: "Advanced" },
];

export const NAV_PAGES = PAGES.filter((p) => p.nav);
/** Phone bar: four tabs plus "More" (390 px fits five 78 px tabs). */
export const MOBILE_PAGES = NAV_PAGES.filter((p) => p.mobile);
export const fallbackIcon = Gauge;
