// Every page in the contract IA (§6). Shared file: pages are filled in their own files, not here.
import { Bot, CloudSun, Database, Gauge, LayoutDashboard, Map as MapIcon, Server, Sprout, Tractor } from "lucide-react";
import type { PageDef } from "./types";
import { OverviewPage } from "./Overview";
import { SeasonPage } from "./Season";
import { MapPage } from "./Map";
import { FarmPage } from "./Farm";
import { WeatherPage } from "./Weather";
import { AssistantPage } from "./Assistant";
import { DataPage } from "./Data";
import { ServicesPage } from "./Services";

export type { PageDef, PageProps } from "./types";

export const PAGES: PageDef[] = [
  { id: "overview", path: "/", navPath: "/", title: "Overview", navLabel: "Overview", icon: LayoutDashboard, nav: true, usesRegion: true, component: OverviewPage },
  { id: "season", path: "/season", navPath: "/season", title: "Live season", navLabel: "Season", icon: Sprout, nav: true, usesRegion: true, component: SeasonPage },
  { id: "map", path: "/map", navPath: "/map", title: "Map", navLabel: "Map", icon: MapIcon, nav: true, usesRegion: true, wide: true, component: MapPage },
  { id: "farm", path: "/farm/:farmId?", navPath: "/farm", title: "Farm detail", navLabel: "Farm", icon: Tractor, nav: false, navParent: "season", usesRegion: false, component: FarmPage },
  { id: "weather", path: "/weather/:cellId?", navPath: "/weather", title: "Weather", navLabel: "Weather", icon: CloudSun, nav: true, usesRegion: true, component: WeatherPage },
  { id: "assistant", path: "/assistant", navPath: "/assistant", title: "Assistant", navLabel: "Assistant", icon: Bot, nav: true, usesRegion: false, component: AssistantPage },
  { id: "data", path: "/data", navPath: "/data", title: "Data & provenance", navLabel: "Data", icon: Database, nav: true, usesRegion: false, component: DataPage },
  { id: "services", path: "/services/:embed?", navPath: "/services", title: "Services", navLabel: "Services", icon: Server, nav: true, usesRegion: false, wide: true, component: ServicesPage },
];

export const NAV_PAGES = PAGES.filter((p) => p.nav);
export const fallbackIcon = Gauge;
