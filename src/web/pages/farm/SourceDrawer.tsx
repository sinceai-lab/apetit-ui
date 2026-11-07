// "Source" drawer: the raw normalized entity and, per attribute, the CSV file (LoadLog) it came from.
import { useMemo, useState } from "react";
import { FileSpreadsheet } from "lucide-react";
import type { LoadLogRow } from "@/shared/types";
import { Async, Drawer, JsonBlock, Table } from "../../components/ui";
import { api } from "../../lib/api";
import { fmtDateTime, shortHash } from "../../lib/format";
import { useApi } from "../../lib/usePoll";

interface Ref {
  attr: string;
  loadLog: string;
}

function refsOf(entity: Record<string, unknown>): Ref[] {
  const out: Ref[] = [];
  for (const [attr, v] of Object.entries(entity)) {
    const ref = (v as { refLoadLog?: { object?: string } } | null)?.refLoadLog?.object;
    if (typeof ref === "string") out.push({ attr, loadLog: ref });
  }
  return out;
}

export function SourceDrawer({ open, onClose, entities }: { open: boolean; onClose: () => void; entities: { id: string; label: string }[] }) {
  const [id, setId] = useState(entities[0]?.id ?? "");
  const entity = useApi((s) => api.entity(id, "normalized", s), [id], { enabled: open && !!id });
  const logs = useApi((s) => api.loadLogs(s), [], { enabled: open });
  const logById = useMemo(() => new Map((logs.data?.loadLogs ?? []).map((l) => [l.id, l] as const)), [logs.data]);

  return (
    <Drawer open={open} onClose={onClose} title="Where this data comes from">
      <label className="mb-3 flex flex-col gap-1 text-sm">
        <span className="text-muted">Entity</span>
        <select value={id} onChange={(e) => setId(e.target.value)} className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-ink">
          {entities.map((e) => (
            <option key={e.id} value={e.id}>
              {e.label}
            </option>
          ))}
        </select>
      </label>
      <p className="mb-3 text-[13px] text-muted">
        Each attribute in the broker links to the LoadLog of the CSV file it was loaded from (<code>refLoadLog</code>), and each LoadLog records the file name and its sha256 fingerprint.
      </p>
      <Async state={entity}>
        {(e) => {
          const refs = refsOf(e);
          const files = new Map<string, string[]>();
          for (const r of refs) files.set(r.loadLog, [...(files.get(r.loadLog) ?? []), r.attr]);
          return (
            <div className="flex flex-col gap-4">
              {files.size > 0 ? (
                <ul className="flex flex-col gap-2">
                  {[...files.entries()].map(([logId, attrs]) => {
                    const l: LoadLogRow | undefined = logById.get(logId);
                    return (
                      <li key={logId} className="rounded-lg border border-border p-3 text-sm">
                        <div className="flex items-center gap-1.5 font-medium text-ink">
                          <FileSpreadsheet className="size-4 text-brand" aria-hidden />
                          {l?.file ?? logId.split(":").pop()}
                        </div>
                        {l && (
                          <div className="tnum mt-0.5 text-xs text-muted" title={l.sha256}>
                            sha256 {shortHash(l.sha256, 12)} · {l.rowsLoaded} rows loaded · {fmtDateTime(l.loadedAt)} (clock time) by {l.loadedBy}
                          </div>
                        )}
                        <div className="mt-1 text-xs text-muted">{attrs.join(", ")}</div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-sm text-muted">This entity was written by the pipeline (not loaded from a CSV), so it has no LoadLog links.</p>
              )}
              {refs.length > 0 && (
                <details>
                  <summary className="cursor-pointer text-sm font-medium text-brand">Attribute → LoadLog table</summary>
                  <Table dense className="mt-2" rows={refs} rowKey={(r) => r.attr} columns={[{ key: "a", header: "Attribute", render: (r) => <code>{r.attr}</code> }, { key: "l", header: "File", render: (r) => logById.get(r.loadLog)?.file ?? r.loadLog }]} />
                </details>
              )}
              <details>
                <summary className="cursor-pointer text-sm font-medium text-brand">Raw NGSI-LD entity</summary>
                <div className="mt-2">
                  <JsonBlock value={e} />
                </div>
              </details>
            </div>
          );
        }}
      </Async>
    </Drawer>
  );
}
