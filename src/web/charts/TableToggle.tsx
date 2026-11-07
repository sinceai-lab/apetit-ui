// Every chart gets a "Show as table" twin (contract §7.3).
import { useContext, useEffect, useId, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { PanelActionSlot } from "../components/ui/Card";
import { ChartColumn, Table2 } from "lucide-react";
import { Segmented } from "../components/ui/Segmented";
import { Table, type TableProps } from "../components/ui/Table";

export function TableToggle<R>({ table, children, toolbar, defaultView = "chart", className }: { table: TableProps<R>; children: ReactNode; toolbar?: ReactNode; defaultView?: "chart" | "table"; className?: string }) {
  const [view, setView] = useState<"chart" | "table">(defaultView);
  const id = useId();
  const slot = useContext(PanelActionSlot);
  // With no toolbar of its own, the toggle moves up to the panel's title row instead of taking a line by itself.
  const wantsSlot = !toolbar && slot != null;
  if (wantsSlot && slot.owner.current == null) slot.owner.current = id;
  const inSlot = wantsSlot && slot.owner.current === id && slot.el != null;
  useEffect(() => () => { if (slot?.owner.current === id) slot.owner.current = null; }, [slot, id]);
  const toggle = (
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
  );
  return (
    <div className={className}>
      {inSlot ? (
        createPortal(toggle, slot.el!)
      ) : !wantsSlot || slot.owner.current !== id ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0 flex-1">{toolbar}</div>
          {toggle}
        </div>
      ) : null}
      {view === "chart" ? children : <Table dense maxHeight={420} {...table} />}
    </div>
  );
}
