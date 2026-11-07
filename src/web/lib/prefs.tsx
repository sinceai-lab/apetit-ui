// App-wide preferences: region switch (Finland/Sweden/Both), light/dark theme and map basemap style, kept per viewer.
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { RegionFilter } from "@/shared/types";

type Theme = "light" | "dark";
type MapStyle = "map" | "satellite";
interface Prefs {
  region: RegionFilter;
  setRegion: (r: RegionFilter) => void;
  theme: Theme;
  toggleTheme: () => void;
  mapStyle: MapStyle;
  setMapStyle: (s: MapStyle) => void;
}

const Ctx = createContext<Prefs | null>(null);

const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {}
};

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [region, setRegionState] = useState<RegionFilter>(() => {
    const v = read("apetit.region");
    return v === "FI_SW" || v === "SE_SKANE" || v === "both" ? v : "FI_SW";
  });
  const [theme, setTheme] = useState<Theme>(() => (document.documentElement.classList.contains("dark") ? "dark" : "light"));
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);
  const setRegion = useCallback((r: RegionFilter) => {
    setRegionState(r);
    write("apetit.region", r);
  }, []);
  const toggleTheme = useCallback(() => {
    setTheme((t) => {
      const n = t === "dark" ? "light" : "dark";
      write("apetit.theme", n);
      return n;
    });
  }, []);
  const [mapStyle, setMapStyleState] = useState<MapStyle>(() => (read("apetit.mapStyle") === "satellite" ? "satellite" : "map"));
  const setMapStyle = useCallback((s: MapStyle) => {
    setMapStyleState(s);
    write("apetit.mapStyle", s);
  }, []);
  return <Ctx.Provider value={{ region, setRegion, theme, toggleTheme, mapStyle, setMapStyle }}>{children}</Ctx.Provider>;
}

export function usePrefs(): Prefs {
  const v = useContext(Ctx);
  if (!v) throw new Error("usePrefs outside PrefsProvider");
  return v;
}
export const useRegion = () => {
  const { region, setRegion } = usePrefs();
  return [region, setRegion] as const;
};
export const useMapStyle = () => {
  const { mapStyle, setMapStyle } = usePrefs();
  return [mapStyle, setMapStyle] as const;
};
export const useIsDark = () => usePrefs().theme === "dark";
