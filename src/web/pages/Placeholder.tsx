// Temporary stand-in used by unbuilt pages; delete the import once a page is implemented.
import type { ReactNode } from "react";
import { Construction } from "lucide-react";
import { Card, PageHeader } from "../components/ui";

export function Placeholder({ title, subtitle, contract, children }: { title: string; subtitle?: string; contract: string; children?: ReactNode }) {
  return (
    <div>
      <PageHeader title={title} subtitle={subtitle} />
      <Card className="flex items-start gap-3 p-5">
        <Construction className="mt-0.5 size-5 text-rapeseed" aria-hidden />
        <div className="text-sm">
          <div className="font-medium text-ink">This page is not built yet.</div>
          <div className="text-muted">Spec: docs/CONTRACT.md {contract}. Shared building blocks: docs/BUILDING.md.</div>
          {children}
        </div>
      </Card>
    </div>
  );
}
