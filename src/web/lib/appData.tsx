// Shared polled data used by the shell and pages: services (10 s) and overview (30 s), fetched once per app.
import { createContext, useContext, type ReactNode } from "react";
import type { OverviewResponse, ServicesResponse } from "@/shared/types";
import { api } from "./api";
import { POLL, useApi, type AsyncState } from "./usePoll";

interface AppData {
  services: AsyncState<ServicesResponse>;
  overview: AsyncState<OverviewResponse>;
}
const Ctx = createContext<AppData | null>(null);

export function AppDataProvider({ children }: { children: ReactNode }) {
  const services = useApi((s) => api.services(s), [], { intervalMs: POLL.services });
  const overview = useApi((s) => api.overview(s), [], { intervalMs: POLL.overview });
  return <Ctx.Provider value={{ services, overview }}>{children}</Ctx.Provider>;
}

function useAppData(): AppData {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAppData outside AppDataProvider");
  return v;
}
export const useServices = () => useAppData().services;
export const useOverview = () => useAppData().overview;
/** Season date chip text, e.g. "Season 2027 · data as of 27 Oct 2027". */
export const useSeason = () => useAppData().overview.data?.season ?? null;
