// Provenance chain explainer plus a live trace: a normalized entity's attributes -> refLoadLog -> file + sha256.
import { useMemo, useState } from "react";
import { ArrowRight, FileText, Fingerprint, ScanSearch, Tag } from "lucide-react";
import type { LoadLogRow } from "@/shared/types";
import { api } from "../../lib/api";
import { useApi } from "../../lib/usePoll";
import { fmtDateTime, fmtNum, shortHash } from "../../lib/format";
import { Async, Button, Drawer, JsonBlock, Loading, Panel, Segmented } from "../../components/ui";

const STEPS = [
  { icon: Tag, title: "Attribute", text: "Every value loaded from a CSV, e.g. a farm's area." },
  { icon: ScanSearch, title: "refLoadLog", text: "A link stored next to the value, pointing at the load that wrote it." },
  { icon: FileText, title: "LoadLog", text: "One record per loaded file: name, rows read, loaded and rejected, who and when." },
  { icon: Fingerprint, title: "sha256", text: "A fingerprint of the exact file, so anyone can check it was not changed." },
];

const EXAMPLES = [
  { value: "urn:ngsi-ld:Farm:F0001", label: "Farm F0001" },
  { value: "urn:ngsi-ld:Farm:S0381", label: "Farm S0381" },
  { value: "urn:ngsi-ld:Parcel:F0001-P03", label: "Parcel F0001-P03" },
  { value: "urn:ngsi-ld:ClimateGridCell:GF0104", label: "Cell GF0104" },
];

export function ProvenancePanel({ loadLogs }: { loadLogs: LoadLogRow[] }) {
  const [open, setOpen] = useState(false);
  const [id, setId] = useState(EXAMPLES[0]!.value);
  return (
    <Panel
      title="Where every number comes from"
      subtitle="Each value in the broker can be traced back to the file it was loaded from."
      actions={
        <Button variant="primary" onClick={() => setOpen(true)}>
          <ScanSearch className="size-4" aria-hidden />
          Trace an example
        </Button>
      }
    >
      <ol className="grid gap-2 sm:grid-cols-4">
        {STEPS.map((s, i) => (
          <li key={s.title} className="relative flex gap-2.5 rounded-lg bg-surface-2 p-3">
            <s.icon className="mt-0.5 size-4 shrink-0 text-brand-vivid" aria-hidden />
            <div>
              <div className="font-heading text-sm font-bold text-heading">{s.title}</div>
              <div className="text-xs text-muted">{s.text}</div>
            </div>
            {i < STEPS.length - 1 && <ArrowRight aria-hidden className="absolute -right-2.5 top-1/2 hidden size-4 -translate-y-1/2 text-muted sm:block" />}
          </li>
        ))}
      </ol>
      <p className="mt-3 text-xs text-muted">Weather readings and yield estimates have no LoadLog: they arrive through the live weather stream and the model's write-back.</p>
      <Drawer open={open} onClose={() => setOpen(false)} title="Trace a record">
        <Segmented size="sm" ariaLabel="Example record" value={id} onChange={setId} options={EXAMPLES} className="mb-3" />
        <Trace id={id} loadLogs={loadLogs} />
      </Drawer>
    </Panel>
  );
}

interface AttrRef {
  attr: string;
  value: string;
  logId: string | null;
}

function Trace({ id, loadLogs }: { id: string; loadLogs: LoadLogRow[] }) {
  const state = useApi((s) => api.entity(id, "normalized", s), [id]);
  const [raw, setRaw] = useState(false);
  const byId = useMemo(() => new Map(loadLogs.map((l) => [l.id, l])), [loadLogs]);
  return (
    <Async state={state} loading={<Loading label="Reading the record from the broker…" />}>
      {(e) => {
        const refs: AttrRef[] = Object.entries(e)
          .filter(([k, v]) => k !== "id" && k !== "type" && v && typeof v === "object")
          .map(([k, v]) => {
            const o = v as Record<string, any>;
            const val = o.type === "Relationship" ? o.object : o.type === "GeoProperty" ? "point" : o.value;
            return { attr: k, value: typeof val === "object" ? JSON.stringify(val).slice(0, 60) : String(val ?? ""), logId: o.refLoadLog?.object ?? null };
          });
        const logs = [...new Set(refs.map((r) => r.logId).filter((x): x is string => !!x))];
        return (
          <div className="space-y-4 text-sm">
            <div>
              <div className="text-xs text-muted">{String(e.type)}</div>
              <div className="break-all font-mono text-xs text-ink">{e.id}</div>
            </div>
            <div>
              <h3 className="mb-1.5 font-heading font-bold text-heading">Loaded from {logs.length === 1 ? "1 file" : `${fmtNum(logs.length)} files`}</h3>
              <ul className="space-y-2">
                {logs.map((lid) => {
                  const l = byId.get(lid);
                  const n = refs.filter((r) => r.logId === lid).length;
                  return (
                    <li key={lid} className="rounded-lg border border-border p-2.5">
                      <div className="flex items-center gap-2">
                        <FileText className="size-4 text-brand-vivid" aria-hidden />
                        <span className="font-medium text-ink">{l?.file ?? "unknown file"}</span>
                        <span className="ml-auto text-xs text-muted">{n} attributes</span>
                      </div>
                      <div className="mt-1 grid grid-cols-2 gap-x-2 text-xs text-muted">
                        <span>sha256 <code className="text-ink" title={l?.sha256}>{shortHash(l?.sha256, 12)}</code></span>
                        <span>{l ? `${fmtNum(l.rowsLoaded)} of ${fmtNum(l.rowsRead)} rows` : lid}</span>
                        <span>by {l?.loadedBy ?? "–"}</span>
                        <span title="Wall-clock load time">{l ? fmtDateTime(l.loadedAt) : "–"}</span>
                      </div>
                    </li>
                  );
                })}
                {!logs.length && <li className="text-xs text-muted">This record has no refLoadLog links (it was written by the pipeline, not loaded from a CSV).</li>}
              </ul>
            </div>
            <div>
              <h3 className="mb-1.5 font-heading font-bold text-heading">Attributes</h3>
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-xs">
                  <thead className="bg-surface-2 text-left text-muted">
                    <tr>
                      <th className="px-2 py-1 font-medium">Attribute</th>
                      <th className="px-2 py-1 font-medium">Value</th>
                      <th className="px-2 py-1 font-medium">From file</th>
                    </tr>
                  </thead>
                  <tbody>
                    {refs.map((r) => (
                      <tr key={r.attr} className="border-t border-border">
                        <td className="px-2 py-1 font-mono">{r.attr}</td>
                        <td className="max-w-[10rem] truncate px-2 py-1" title={r.value}>{r.value}</td>
                        <td className="px-2 py-1 text-muted">{r.logId ? byId.get(r.logId)?.file ?? shortHash(r.logId.split(":").pop()) : "–"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <Button variant="ghost" className="text-xs" onClick={() => setRaw((x) => !x)}>
              {raw ? "Hide" : "Show"} the raw record
            </Button>
            {raw && <JsonBlock value={e} />}
          </div>
        );
      }}
    </Async>
  );
}

/** Drawer body for one LoadLog row: the normalized broker entity. */
export function LoadLogDetail({ log }: { log: LoadLogRow }) {
  const state = useApi((s) => api.entity(log.id, "normalized", s), [log.id]);
  return (
    <div className="space-y-3 text-sm">
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="text-muted">File</dt>
        <dd className="text-ink">{log.file}</dd>
        <dt className="text-muted">Type</dt>
        <dd className="text-ink">{log.schema}</dd>
        <dt className="text-muted">sha256</dt>
        <dd className="break-all font-mono text-ink">{log.sha256}</dd>
        <dt className="text-muted">Rows</dt>
        <dd className="tnum text-ink">{fmtNum(log.rowsRead)} read · {fmtNum(log.rowsLoaded)} loaded · {fmtNum(log.rowsDropped)} dropped · {fmtNum(log.rowsRejected)} rejected</dd>
        <dt className="text-muted">Loaded</dt>
        <dd className="text-ink">{fmtDateTime(log.loadedAt)} by {log.loadedBy}</dd>
      </dl>
      <Async state={state}>{(e) => <JsonBlock value={e} />}</Async>
    </div>
  );
}
