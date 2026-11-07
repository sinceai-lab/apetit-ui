// Every chart gets a "Show as table" twin (contract §7.3).
import { useState, type ReactNode } from "react";
import { ChartColumn, Table2 } from "lucide-react";
import { Segmented } from "../components/ui/Segmented";
import { Table, type TableProps } from "../components/ui/Table";

export function TableToggle<R>({ table, children, toolbar, defaultView = "chart", className }: { table: TableProps<R>; children: ReactNode; toolbar?: ReactNode; defaultView?: "chart" | "table"; className?: string }) {
  const [view, setView] = useState<"chart" | "table">(defaultView);
  return (
    <div className={className}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 flex-1">{toolbar}</div>
        <Segmented
          size="sm"
          ariaLabel="View as"
          value={view}
          onChange={setView}
          options={[
            { value: "chart", label: <><ChartColumn className="size-3.5" aria-hidden />Chart</> },
            { value: "table", label: <><Table2 className="size-3.5" aria-hidden />Table</> },
          ]}
        />
      </div>
      {view === "chart" ? children : <Table dense maxHeight={420} {...table} />}
    </div>
  );
}
