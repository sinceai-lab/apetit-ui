// Collapsible "steps" the agent took (MCP tool calls), with spinner, ok/error state and truncated output.
import { useState } from "react";
import { Check, ChevronDown, ChevronRight, Loader2, X } from "lucide-react";
import { TOOL_RESULT_DISPLAY_CHARS, toolLabel } from "@/shared/chat";
import { cn } from "../../lib/cn";
import { argSummary, resultSummary, type Turn } from "./turns";

type Step = Extract<Turn, { kind: "tool" }>;

export function ToolSteps({ steps, running }: { steps: Step[]; running: boolean }) {
  const [open, setOpen] = useState(false);
  const failed = steps.filter((s) => s.result?.isError).length;
  return (
    <div className="rounded-card border border-border border-l-[3px] border-l-brand-vivid bg-surface-2 text-sm">
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-muted transition-colors duration-300 hover:text-brand">
        {open ? <ChevronDown className="size-4" aria-hidden /> : <ChevronRight className="size-4" aria-hidden />}
        <span className="font-heading text-[13px] font-bold text-heading">
          {steps.length} data {steps.length === 1 ? "lookup" : "lookups"}
          {failed ? ` · ${failed} failed` : ""}
        </span>
        <span className="flex min-w-0 flex-1 flex-wrap gap-1">
          {!open &&
            steps.map((s) => (
              <span key={s.call.id} className="inline-flex items-center gap-1 rounded border border-border bg-surface px-2 py-0.5 text-xs font-medium text-ink">
                <StepIcon step={s} running={running} />
                {toolLabel(s.call.name)}
              </span>
            ))}
        </span>
      </button>
      {open && (
        <ol className="space-y-1.5 border-t border-border px-3 py-2">
          {steps.map((s) => (
            <StepRow key={s.call.id} step={s} running={running} />
          ))}
        </ol>
      )}
    </div>
  );
}

function StepIcon({ step, running }: { step: Step; running: boolean }) {
  if (!step.result) return running ? <Loader2 className="size-3 animate-spin text-muted" aria-label="running" /> : <X className="size-3 text-muted" aria-label="not finished" />;
  return step.result.isError ? <X className="size-3 text-down" aria-label="failed" /> : <Check className="size-3 text-up" aria-label="done" />;
}

function StepRow({ step, running }: { step: Step; running: boolean }) {
  const [open, setOpen] = useState(false);
  const [all, setAll] = useState(false);
  const summary = argSummary(step.call.args);
  const res = resultSummary(step.result);
  const content = step.result?.content ?? "";
  const long = content.length > TOOL_RESULT_DISPLAY_CHARS;
  return (
    <li>
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left transition-colors duration-300 hover:bg-surface">
        <StepIcon step={step} running={running} />
        <span className="font-medium text-ink">{toolLabel(step.call.name)}</span>
        {summary && <span className="truncate text-xs text-muted">{summary}</span>}
        {res && <span className={cn("ml-auto shrink-0 text-xs", step.result?.isError ? "text-down" : "text-muted")}>{res}</span>}
      </button>
      {open && (
        <div className="mt-1 space-y-2 pl-6">
          <div>
            <div className="eyebrow text-[11px]">Tool · {step.call.name}</div>
            <pre className="mt-0.5 max-h-48 overflow-auto rounded border border-border bg-surface p-2 font-mono text-xs">{JSON.stringify(step.call.args, null, 2)}</pre>
          </div>
          {step.result && (
            <div>
              <div className="eyebrow text-[11px]">Result{long ? ` · ${(content.length / 1024).toFixed(0)} KB` : ""}</div>
              <pre className="mt-0.5 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded border border-border bg-surface p-2 font-mono text-xs">{all || !long ? content : content.slice(0, TOOL_RESULT_DISPLAY_CHARS) + "\n…"}</pre>
              {long && (
                <button type="button" className="link mt-1 text-xs" onClick={() => setAll((a) => !a)}>
                  {all ? "Show less" : "Show all"}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </li>
  );
}
