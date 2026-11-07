import { useEffect } from "react";
import { PAGES } from "./pages/registry";
import { Shell } from "./components/shell/Shell";
import { EmptyState } from "./components/ui";
import { AppDataProvider } from "./lib/appData";
import { PrefsProvider } from "./lib/prefs";
import { matchPath, useLocation } from "./lib/router";

function resolve(path: string) {
  for (const page of PAGES) {
    const params = matchPath(page.path, path);
    if (params) return { page, params };
  }
  return null;
}

function Routes() {
  const loc = useLocation();
  const hit = resolve(loc.path);
  useEffect(() => {
    document.title = hit ? `${hit.page.title} · Apetit Farm insights` : "Apetit Farm insights";
    window.scrollTo(0, 0);
  }, [hit?.page.id, loc.path]);
  const Page = hit?.page.component;
  return (
    <Shell page={hit?.page ?? null}>
      {Page ? (
        <Page key={hit.page.id} params={hit.params} query={loc.query} />
      ) : (
        <EmptyState title="Page not found">
          <a className="text-brand underline" href="#/">
            Back to the overview
          </a>
        </EmptyState>
      )}
    </Shell>
  );
}

export function App() {
  return (
    <PrefsProvider>
      <AppDataProvider>
        <Routes />
      </AppDataProvider>
    </PrefsProvider>
  );
}
