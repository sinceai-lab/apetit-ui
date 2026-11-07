// Model trust: held-out backtests, model vs farm-average baseline, live replay (contract §10.3). Builder B.
import type { Crop, Region } from "@/shared/types";
import { BACKTEST_TESTS, type BacktestTest, type InsightsTrust } from "@/shared/insights";
import type { PageProps } from "./types";
import { Async, Card, Loading, PageHeader, Panel, Segmented, Stat, Table } from "../components/ui";
import { Legend, TableToggle, VIZ } from "../charts";
import { useCorrections, useInsightsMeta, useTrust } from "../lib/insights";
import { cropLabel, fmtFixed, fmtNum, fmtShare, regionLabel } from "../lib/format";
import { setQuery } from "../lib/router";
import { BasisChip, Expander, Notice, StaleNotice } from "./try/common";
import { PairedBars } from "./trust/PairedBars";
import { LiveReplay, SeasonBySeason, SingleFarm } from "./trust/Sections";

const TEST_LABEL: Record<BacktestTest, string> = { loyo: "Leave one season out", forward: "Predict 2022–2026" };
const PAIR = [
  { label: "Baseline: farm average", color: VIZ.baseline },
  { label: "Our model", color: VIZ.estimate },
];

export function TrustPage({ query }: PageProps) {
  const test = (BACKTEST_TESTS as string[]).includes(query.get("test") ?? "") ? (query.get("test") as BacktestTest) : "loyo";
  const trust = useTrust(test);
  const meta = useInsightsMeta();

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Can we trust this?"
        subtitle="Does weather make yield forecasts better? Both methods predict a contract crop's yield on a farm for a season they did not see in training."
        actions={
          <Segmented
            size="sm"
            ariaLabel="How to test"
            value={test}
            onChange={(t) => setQuery({ test: t })}
            options={BACKTEST_TESTS.map((t) => ({ value: t, label: TEST_LABEL[t], title: t === "loyo" ? "Also uses later seasons to predict earlier ones." : "Predict 2022–2026 from earlier seasons: trains only on earlier seasons." }))}
          />
        }
      />
      {meta.data?.synthetic && <Notice>{meta.data.disclaimer || "The data is synthetic, so these results say nothing about real Apetit farms."}</Notice>}

      <Async state={trust} loading={<Loading label="Loading backtests…" />}>
        {(d) => <TrustBody d={d} test={test} crop={query.get("crop")} />}
      </Async>
    </div>
  );
}

function TrustBody({ d, test, crop: qCrop }: { d: InsightsTrust; test: BacktestTest; crop: string | null }) {
  const crops = [...new Set(d.byCrop.map((r) => r.crop))];
  const crop = (crops as string[]).includes(qCrop ?? "") ? (qCrop as Crop) : (crops[0] ?? "pea");
  const regions = [...new Set(d.byCrop.filter((r) => r.crop === crop).map((r) => r.region))] as Region[];
  const scopes = [...new Set(d.byCrop.filter((r) => r.crop === crop).map((r) => `${r.region}/${r.crop}`))];
  const corrections = useCorrections();

  return (
    <>
      <div className="grid gap-5 md:grid-cols-2">
        {d.methods.map((m) => (
          <Card key={m.code} className="p-4">
            <div className="eyebrow">{m.code === "baseline" ? "Baseline" : "Our model"}</div>
            <h2 className="mt-1 font-display text-lg font-bold text-heading">{m.label}</h2>
            <p className="mt-1 text-sm">{m.text}</p>
          </Card>
        ))}
      </div>

      <Panel title="How close did each method get?" subtitle={`${d.label}. Lower is better. Finland and Sweden shown separately.`} actions={<BasisChip basis={d.basis} />}>
        <StaleNotice basis={d.basis} className="mb-3" />
        <Notice className="mb-4">{d.headlineNote}</Notice>
        <div className="grid gap-5 md:grid-cols-2">
          {d.headlineByRegion.map((h) => (
            <div key={h.region} className="rounded-card border border-border p-4">
              <div className="eyebrow mb-2">{h.label}</div>
              <div className="grid grid-cols-2 gap-5">
                <Stat label="Regional production error" value={fmtShare(h.productionError.model, 1)} foot={`Baseline ${fmtShare(h.productionError.baseline, 1)}`} source="Our model, held-out seasons" />
                <Stat label="Farm-level yield error (nRMSE)" value={fmtFixed(h.yieldErrorNrmse.model, 3)} foot={`Baseline ${fmtFixed(h.yieldErrorNrmse.baseline, 3)}`} source="Our model, held-out seasons" />
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted">{d.caveat}</p>
      </Panel>

      <Panel title="Regional production error, by crop" subtitle={d.byCropNote} actions={<BasisChip basis={d.basis} />}>
        <TableToggle
          toolbar={<Legend items={PAIR.map((p) => ({ ...p, shape: "rect" as const }))} />}
          table={{
            columns: [
              { key: "l", header: "Region and crop", render: (r) => r.label },
              { key: "n", header: "Seasons", align: "right", render: (r) => fmtNum(r.seasons) },
              { key: "bp", header: "Baseline production error", align: "right", render: (r) => fmtShare(r.baselineProductionError, 1), sortValue: (r) => r.baselineProductionError },
              { key: "mp", header: "Our model production error", align: "right", render: (r) => fmtShare(r.modelProductionError, 1), sortValue: (r) => r.modelProductionError },
              { key: "by", header: "Baseline yield error", align: "right", render: (r) => fmtFixed(r.baselineYieldError, 3) },
              { key: "my", header: "Our model yield error", align: "right", render: (r) => fmtFixed(r.modelYieldError, 3) },
              { key: "i", header: "Improvement", align: "right", render: (r) => fmtShare(r.improvement), sortValue: (r) => r.improvement },
            ],
            rows: d.byCrop,
            rowKey: (r) => `${r.region}-${r.crop}`,
          }}
        >
          <PairedBars
            ariaLabel="Production error of the baseline and our model per region and crop"
            rows={d.byCrop.map((r) => ({ key: `${r.region}-${r.crop}`, label: r.label, values: [r.baselineProductionError, r.modelProductionError] }))}
            series={PAIR}
            format={(v) => fmtShare(v, 1)}
          />
        </TableToggle>
      </Panel>

      <section className="flex flex-col gap-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-title text-xl font-semibold text-heading">Season by season</h2>
            <p className="text-sm text-muted">The baseline stays nearly flat. The test of our model is whether it follows the good and bad seasons.</p>
          </div>
          <Segmented size="sm" ariaLabel="Crop" value={crop} onChange={(c) => setQuery({ crop: c })} options={crops.map((c) => ({ value: c, label: cropLabel(c) }))} />
        </div>
        {regions.length ? (
          <>
            <SeasonBySeason crop={crop} regions={regions} test={test} />
            <SingleFarm key={`${crop}-${test}`} crop={crop} regions={regions} test={test} />
          </>
        ) : null}
      </section>

      <LiveReplay key={`${crop}-${test}`} test={test} scopes={scopes} />

      <div className="flex flex-col gap-2">
        <Expander title="Pea model used for long-range results">
          <p className="mb-3">{d.peaModelsNote}</p>
          <Table
            dense
            columns={[
              { key: "r", header: "Region", render: (r) => regionLabel(r.region) },
              { key: "m", header: "Method", render: (r) => r.label },
              { key: "p", header: "Production error", align: "right", render: (r) => fmtShare(r.productionError, 1) },
              { key: "y", header: "Yield error", align: "right", render: (r) => fmtFixed(r.yieldError, 3) },
            ]}
            rows={d.peaModels}
            rowKey={(r) => `${r.region}-${r.method}`}
          />
        </Expander>
        <Expander title="Hackathon auto-scorer (not used by Apetit)">
          <p>{d.scorer.note}</p>
        </Expander>
        <Expander title="How the yield data was cleaned">
          <Async state={corrections}>
            {(c) => (
              <>
                <div className="mb-2">
                  <BasisChip basis={c.basis} />
                </div>
                <p className="mb-3">{c.summary.text}</p>
                <Table
                  dense
                  maxHeight={360}
                  columns={[
                    { key: "k", header: "Record", render: (r) => r.recordKey },
                    { key: "f", header: "Data field", render: (r) => r.field },
                    { key: "o", header: "Old value", align: "right", render: (r) => (typeof r.oldValue === "number" ? fmtFixed(r.oldValue, 2) : (r.oldValue ?? "–")) },
                    { key: "n", header: "New value", align: "right", render: (r) => (typeof r.newValue === "number" ? fmtFixed(r.newValue, 2) : (r.newValue ?? "–")) },
                    { key: "r", header: "Rule", render: (r) => r.rule, className: "min-w-64" },
                    { key: "s", header: "Source", render: (r) => r.source },
                    { key: "u", header: "Used in training", render: (r) => (r.usedForYield ? "Yes" : "No") },
                  ]}
                  rows={c.rows}
                  rowKey={(r, i) => `${r.recordKey}-${r.field}-${i}`}
                />
              </>
            )}
          </Async>
        </Expander>
        {d.c1SelfCheck && (
          <Expander title="C1 self-check">
            <p>
              Live predictions differ from the submitted C1 file by at most <span className="tnum font-medium">{fmtFixed(d.c1SelfCheck.maxDiffTHa, 4)} t/ha</span> on {fmtNum(d.c1SelfCheck.rows)} rows.
            </p>
            <p className="mt-1 text-xs text-muted">{d.c1SelfCheck.note}</p>
          </Expander>
        )}
      </div>
    </>
  );
}
