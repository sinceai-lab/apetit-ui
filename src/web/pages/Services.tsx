// Every running service with status, latency and links; C3 and Streamlit can be embedded (contract §1, §6.8).
import { ExternalLink, HardDrive, RefreshCw } from "lucide-react";
import type { ServiceGroup, ServiceStatus } from "@/shared/types";
import type { PageProps } from "./types";
import { useServices } from "../lib/appData";
import { fmtAgo, fmtTime } from "../lib/format";
import { href } from "../lib/router";
import { Async, Badge, Button, Card, PageHeader, Segmented, StatusDot, UpstreamBanner } from "../components/ui";
import { ServiceCard } from "./services/ServiceCard";
import { EmbedView, EMBEDS, type EmbedId } from "./services/EmbedView";

const GROUPS: { id: ServiceGroup; title: string; blurb: string }[] = [
  { id: "pipeline", title: "Data pipeline", blurb: "Where the farm, weather and yield data flows: broker, weather stream, inference and the backend relay." },
  { id: "ai", title: "AI assistant", blurb: "The chat-bot answers questions by calling the MCP server, which reads the broker." },
  { id: "tools", title: "Tools", blurb: "Other apps that look at the same broker data." },
  { id: "platform", title: "Platform and security", blurb: "Sign-in (Keycloak) and the secured API gateway (APISIX)." },
];

export function ServicesPage({ params }: PageProps) {
  const state = useServices();
  const embed = params.embed && params.embed in EMBEDS ? (params.embed as EmbedId) : null;
  const tab = embed ?? "all";

  return (
    <div className="mx-auto max-w-[1600px]">
      <PageHeader
        title="Services"
        subtitle="Everything this app is built on, checked every 10 seconds while this page is open."
        actions={
          <>
            <Segmented
              ariaLabel="View"
              value={tab}
              onChange={(v) => (location.hash = href(v === "all" ? "/services" : `/services/${v}`))}
              options={[
                { value: "all", label: "All services" },
                { value: "c3", label: "c³ explorer" },
                { value: "streamlit", label: "Model viewer" },
              ]}
            />
            <Button onClick={state.refresh} disabled={state.loading} title="Check again now">
              <RefreshCw className={state.loading ? "size-4 animate-spin" : "size-4"} aria-hidden />
              <span className="hidden sm:inline">Check now</span>
            </Button>
          </>
        }
      />

      <Async state={state}>
        {(data) =>
          embed ? (
            <EmbedView id={embed} service={data.services.find((s) => s.id === embed) ?? null} />
          ) : (
            <>
              <UpstreamBanner errors={data.errors} />
              <Summary services={data.services} checkedAt={data.checkedAt} />
              <div className="space-y-8">
                {GROUPS.map((g) => {
                  const list = data.services.filter((s) => s.group === g.id);
                  if (!list.length) return null;
                  return (
                    <section key={g.id} aria-labelledby={`grp-${g.id}`}>
                      <h2 id={`grp-${g.id}`} className="font-display text-lg font-bold text-heading">{g.title}</h2>
                      <p className="mb-3 text-[13px] text-muted">{g.blurb}</p>
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        {list.map((s) => (
                          <ServiceCard key={s.id} service={s} />
                        ))}
                        {g.id === "pipeline" && <StorageCard />}
                      </div>
                    </section>
                  );
                })}
              </div>
            </>
          )
        }
      </Async>
    </div>
  );
}

function Summary({ services, checkedAt }: { services: ServiceStatus[]; checkedAt: string }) {
  const up = services.filter((s) => s.status === "up").length;
  const deg = services.filter((s) => s.status === "degraded");
  const down = services.filter((s) => s.status === "down");
  const lat = services.map((s) => s.latencyMs).filter((v): v is number => v != null);
  const median = lat.length ? [...lat].sort((a, b) => a - b)[Math.floor(lat.length / 2)] : null;
  const allOk = !deg.length && !down.length;
  return (
    <Card className="mb-6 grid gap-5 p-4 sm:grid-cols-[auto_1fr_auto] sm:items-center">
      <div className="flex items-baseline gap-2">
        <span className="tnum text-[32px] font-semibold leading-none text-heading">{up}</span>
        <span className="text-sm text-muted">of {services.length} services up</span>
      </div>
      <div className="text-sm">
        {allOk ? (
          <span className="inline-flex items-center gap-1.5 text-ink">
            <StatusDot status="up" /> Everything is running normally.
          </span>
        ) : (
          <div className="space-y-0.5">
            {down.map((s) => (
              <div key={s.id} className="flex items-center gap-1.5">
                <StatusDot status="down" /> <b className="font-medium">{s.name}</b> is down. Pages that use it show a notice instead of data.
              </div>
            ))}
            {deg.map((s) => (
              <div key={s.id} className="flex items-center gap-1.5">
                <StatusDot status="degraded" /> <b className="font-medium">{s.name}</b> answers but is not fully healthy ({s.detail}).
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="text-xs text-muted sm:text-right" title={`Checked ${checkedAt}`}>
        Checked {fmtTime(checkedAt)} ({fmtAgo(checkedAt)})
        {median != null && <div className="tnum">Typical response {median} ms</div>}
      </div>
    </Card>
  );
}

function StorageCard() {
  return (
    <Card className="flex flex-col gap-2 border-dashed p-4">
      <div className="flex items-center gap-2">
        <HardDrive className="size-4 text-muted" aria-hidden />
        <span className="font-medium text-ink">Broker storage</span>
        <Badge tone="neutral" className="ml-auto">not polled</Badge>
      </div>
      <p className="text-[13px] text-muted">
        MongoDB (:27017) holds the current entities and TimescaleDB (:5432) holds their history. They have no web page; if the broker is up, they are too.
      </p>
      <a className="link mt-auto inline-flex items-center gap-1 text-xs" href="#/data">
        See what is stored <ExternalLink className="size-3" aria-hidden />
      </a>
    </Card>
  );
}
