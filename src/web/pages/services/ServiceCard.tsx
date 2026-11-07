// One service: status (glyph + text), latency, detail/version, what it does, and Open / Embed links.
import { ExternalLink, MonitorPlay } from "lucide-react";
import type { ServiceStatus } from "@/shared/types";
import { cn } from "../../lib/cn";
import { href } from "../../lib/router";
import { Card, LinkButton, StatusBadge } from "../../components/ui";

interface Info {
  what: string;
  uses?: string;
  version?: string;
}

// Plain-language role of each service; versions only where the service reports or is pinned to one.
const INFO: Record<string, Info> = {
  broker: { what: "Holds all farm, parcel, weather and yield data (NGSI-LD).", uses: "MongoDB + TimescaleDB" },
  context: { what: "Publishes the JSON-LD vocabulary that names every attribute." },
  weather: { what: "Receives each new daily weather reading from the broker and logs it.", uses: "broker subscription" },
  inference: { what: "Turns weather readings into in-season yield estimates and writes them back.", uses: "broker subscription" },
  backend: { what: "Token-protected relay of the yield estimates. This app reads predictions through it.", uses: "inference" },
  chatbot: { what: "AI assistant behind the Assistant page.", uses: "MCP server, model provider" },
  mcp: { what: "Gives the assistant read-only tools over the broker.", uses: "broker" },
  c3: { what: "Explore entities as a graph, a map and live values." },
  streamlit: { what: "The model team's analysis app: risk, farm, map, live and trust tabs." },
  legacy: { what: "The previous web UI. Kept for reference." },
  keycloak: { what: "Sign-in for the secured gateway (realm farm-management).", version: "24" },
  apisix: { what: "Secured gateway: /coraine/* to the broker with a Keycloak token.", uses: "Keycloak", version: "3.9" },
};

const hostPort = (u: string) => {
  try {
    return new URL(u).host;
  } catch {
    return u;
  }
};
const latencyTone = (ms: number | null) => (ms == null ? "text-muted" : ms < 100 ? "text-up" : ms < 800 ? "text-degraded" : "text-down");

export function ServiceCard({ service: s }: { service: ServiceStatus }) {
  const info = INFO[s.id];
  const embeddable = s.id === "c3" || s.id === "streamlit";
  const version = info?.version ?? (s.id === "broker" || s.id === "inference" ? s.detail?.match(/(\d+\.\d+\.\d+|[0-9a-f]{8})/)?.[0] : undefined);
  return (
    <Card className={cn("flex flex-col gap-3 p-4", s.status === "down" && "border-berry/50", s.status === "degraded" && "border-rapeseed")}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="font-heading font-bold leading-tight text-heading">{s.name}</h3>
          <div className="mt-0.5 font-mono text-[11px] text-muted">{hostPort(s.healthUrl)}</div>
        </div>
        <StatusBadge status={s.status} />
      </div>
      {info && <p className="text-[13px] text-muted">{info.what}</p>}
      <dl className="grid grid-cols-3 gap-2 text-xs">
        <div>
          <dt className="text-muted">Response</dt>
          <dd className={cn("tnum text-sm font-semibold", latencyTone(s.latencyMs))}>{s.latencyMs == null ? "no answer" : `${s.latencyMs} ms`}</dd>
        </div>
        <div>
          <dt className="text-muted">Version</dt>
          <dd className="tnum truncate text-sm font-semibold text-ink" title={version}>{version ?? "–"}</dd>
        </div>
        <div>
          <dt className="text-muted">Depends on</dt>
          <dd className="truncate text-sm text-ink" title={info?.uses}>{info?.uses ?? "–"}</dd>
        </div>
      </dl>
      {s.detail && (
        <div className={cn("rounded-card px-2 py-1 text-xs", s.status === "up" ? "bg-surface-2 text-muted" : "bg-berry-soft text-ink")} title={`Health check: ${s.healthUrl}`}>
          {s.status === "down" ? `Not answering: ${s.detail}` : s.detail}
        </div>
      )}
      <div className="mt-auto flex flex-wrap gap-2">
        {embeddable && s.embedUrl && (
          <LinkButton href={href(`/services/${s.id}`)} variant="primary" className="text-xs">
            <MonitorPlay className="size-3.5" aria-hidden />
            Open here
          </LinkButton>
        )}
        {s.openUrl && (
          <LinkButton href={s.openUrl} external className="text-xs">
            <ExternalLink className="size-3.5" aria-hidden />
            Open in new tab
          </LinkButton>
        )}
        {s.id === "chatbot" && (
          <LinkButton href={href("/assistant")} className="text-xs">
            Ask the assistant
          </LinkButton>
        )}
      </div>
    </Card>
  );
}
