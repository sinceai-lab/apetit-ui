// CSV files → Broker → Weather stream → Inference → Write-back → This UI, each with live status and one metric.
import { ChevronRight, Database, FileSpreadsheet, MonitorSmartphone, Radio, Sparkles, Upload, type LucideIcon } from "lucide-react";
import type { Pipeline, PredictionSource, ServiceState, ServiceStatus } from "@/shared/types";
import { StatusBadge } from "../../components/ui";
import { cn } from "../../lib/cn";
import { fmtCompact, fmtDateTime, fmtNum, fmtTime } from "../../lib/format";
import { shortModel } from "../season/common";

type S = ServiceState | "unknown";
interface Stage {
  key: string;
  label: string;
  icon: LucideIcon;
  status: S;
  metric: string;
  sub: string;
  title: string;
  href: string;
}

const svc = (services: ServiceStatus[] | undefined, id: string): S => services?.find((s) => s.id === id)?.status ?? "unknown";
const worst = (...xs: S[]): S => (xs.includes("down") ? "down" : xs.includes("degraded") ? "degraded" : xs.every((x) => x === "unknown") ? "unknown" : "up");

export function buildStages(p: Pipeline, services: ServiceStatus[] | undefined, source: PredictionSource | null): Stage[] {
  const broker = svc(services, "broker");
  return [
    {
      key: "csv",
      label: "CSV files",
      icon: FileSpreadsheet,
      status: p.csv.loadLogs === 0 ? "down" : p.csv.rowsRejected > 0 ? "degraded" : "up",
      metric: `${fmtNum(p.csv.loadLogs)} files`,
      sub: `${fmtNum(p.csv.rowsRejected)} rows rejected`,
      title: `LoadLog · last file loaded ${fmtDateTime(p.csv.lastLoadAt)} (clock time)`,
      href: "#/data",
    },
    {
      key: "broker",
      label: "Broker",
      icon: Database,
      status: p.broker.up ? broker : "down",
      metric: `${fmtCompact(p.broker.entities)} entities`,
      sub: `${fmtCompact(p.broker.weatherObserved)} weather days`,
      title: `Coraine NGSI-LD broker · ${fmtNum(p.broker.entities)} entities across all types`,
      href: "#/data",
    },
    {
      key: "stream",
      label: "Weather stream",
      icon: Radio,
      status: p.stream.subscriptions === 0 ? "down" : worst(p.stream.allOk ? "up" : "degraded", svc(services, "weather")),
      metric: `${fmtNum(p.inference.notifications)} pushes`,
      sub: p.stream.lastNotification ? `last ${fmtTime(p.stream.lastNotification)}` : "no pushes yet",
      title: `${p.stream.subscriptions} broker subscriptions · last notification ${fmtDateTime(p.stream.lastNotification)} (clock time)`,
      href: "#/data",
    },
    {
      key: "inference",
      label: "Yield model",
      icon: Sparkles,
      status: p.inference.up ? svc(services, "inference") : "down",
      metric: `model ${shortModel(p.inference.modelVersion)}`,
      sub: `${fmtCompact(p.inference.readingsNew)} readings`,
      title: `Inference service · ${fmtNum(p.inference.readingsNew)} new weather readings · last push ${fmtDateTime(p.inference.lastNotificationAt)} (clock time)`,
      href: "#/services",
    },
    {
      key: "writeback",
      label: "Write-back",
      icon: Upload,
      status: !p.writeback.enabled ? "unknown" : p.writeback.hasError ? "down" : p.writeback.pending > 0 ? "degraded" : "up",
      metric: `${fmtNum(p.writeback.yieldPredictions)} written`,
      sub: `${fmtNum(p.writeback.pending)} pending`,
      title: "YieldPrediction entities in the broker, written back by the model",
      href: "#/data",
    },
    {
      key: "ui",
      label: "This UI",
      icon: MonitorSmartphone,
      status: "up",
      metric: "you are here",
      sub: source ? `via ${source}` : "no estimates",
      title: source ? `Estimates read through the ${source}` : "Estimates not available",
      href: "#/services",
    },
  ];
}

export function PipelineStrip({ stages }: { stages: Stage[] }) {
  return (
    <ol aria-label="Data pipeline" className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:flex lg:items-stretch lg:gap-0">
      {stages.map((s, i) => {
        const Icon = s.icon;
        return (
          <li key={s.key} className="flex min-w-0 items-stretch lg:flex-1">
            <a
              href={s.href}
              title={s.title}
              className={cn(
                "group flex min-w-0 flex-1 flex-col gap-1 rounded-card border bg-surface px-3 py-2.5 transition-colors hover:border-brand",
                s.status === "down" ? "border-down/60" : s.status === "degraded" ? "border-degraded/60" : "border-border",
              )}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="inline-flex min-w-0 items-center gap-1.5 text-[13px] font-medium text-ink">
                  <Icon className="size-4 shrink-0 text-brand" aria-hidden />
                  <span className="truncate">{s.label}</span>
                </span>
              </div>
              <div className="tnum truncate text-[15px] font-semibold text-ink">{s.metric}</div>
              <div className="flex flex-wrap items-center justify-between gap-1">
                <span className="tnum truncate text-xs text-muted">{s.sub}</span>
                <StatusBadge status={s.status} />
              </div>
            </a>
            {i < stages.length - 1 && <ChevronRight className="mx-0.5 hidden size-4 shrink-0 self-center text-muted lg:block" aria-hidden />}
          </li>
        );
      })}
    </ol>
  );
}
