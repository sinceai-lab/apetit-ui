// Full-height iframe for C3 / Streamlit (contract §1: neither sends X-Frame-Options or CSP, so both may be embedded).
// Streamlit is iframed directly (not proxied) because it needs its own websocket.
import { ArrowLeft, ExternalLink, Info } from "lucide-react";
import type { ServiceStatus } from "@/shared/types";
import { href } from "../../lib/router";
import { Card, LinkButton, StatusBadge } from "../../components/ui";

export const EMBEDS = {
  c3: { title: "c³ Control Center", note: "To browse the broker, open the Explore tab and press Connect. The broker address is filled in already." },
  streamlit: { title: "Yield model viewer", note: "The model team's own analysis app. It reads the same data, but its numbers can differ from this app's live estimates." },
} as const;
export type EmbedId = keyof typeof EMBEDS;

export function EmbedView({ id, service }: { id: EmbedId; service: ServiceStatus | null }) {
  const e = EMBEDS[id];
  const url = service?.embedUrl;
  const open = service?.openUrl ?? url;
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <LinkButton href={href("/services")} variant="ghost" className="text-xs">
          <ArrowLeft className="size-3.5" aria-hidden />
          All services
        </LinkButton>
        <h2 className="font-display text-lg font-bold text-heading">{e.title}</h2>
        {service && <StatusBadge status={service.status} />}
        {open && (
          <LinkButton href={open} external className="ml-auto text-xs">
            <ExternalLink className="size-3.5" aria-hidden />
            Open in new tab
          </LinkButton>
        )}
      </div>
      <p className="mb-3 flex items-start gap-2 text-[13px] text-muted">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        {e.note}
      </p>
      {!service || service.status === "down" || !url ? (
        <Card className="flex flex-col items-center gap-2 p-10 text-center">
          <div className="font-medium text-ink">{e.title} is not running right now</div>
          <div className="max-w-md text-sm text-muted">{service?.detail ? `Health check: ${service.detail}.` : "No health information."} This page will show it again as soon as it answers.</div>
        </Card>
      ) : (
        <iframe
          key={url}
          src={url}
          title={e.title}
          className="block h-[80vh] min-h-[560px] w-full rounded-card border border-border bg-surface"
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      )}
    </div>
  );
}
