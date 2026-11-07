# Building pages

The foundation is in place: the server, every API route, the theme, the shell, the UI primitives and the charts. Each page is a placeholder in its own file. Fill in a page by editing **only** `src/web/pages/<Name>.tsx`. If a page needs private helpers, put them in a new folder `src/web/pages/<name>/` (lowercase), for example `pages/assistant/Markdown.tsx`.

## Ownership (so two agents never touch the same file)

| Agent | Files |
|---|---|
| A | `pages/Overview.tsx`, `pages/Season.tsx`, `pages/Map.tsx`, `pages/Farm.tsx` (+ `pages/overview/`, `pages/season/`, `pages/map/`, `pages/farm/`) |
| B | `pages/Weather.tsx`, `pages/Assistant.tsx`, `pages/Data.tsx`, `pages/Services.tsx` (+ `pages/weather/`, `pages/assistant/`, `pages/data/`, `pages/services/`) |

**Shared files, don't edit:** `package.json`, `src/server/**`, `src/shared/**`, `src/web/{App,main}.tsx`, `src/web/styles.css`, `src/web/lib/**`, `src/web/components/**`, `src/web/charts/**`, `src/web/pages/{registry.tsx,types.ts,Placeholder.tsx}`.

If you need something shared, build a page-local copy in your own folder and mention it in your report. Don't change the shared module.

The dependencies already include `leaflet` and `@types/leaflet` for the Map page, and the Leaflet CSS is already imported in `styles.css`. There's no Markdown library. The Assistant page should write a light renderer in `pages/assistant/`.

Rules:

- Keep code comments to 3 lines or fewer.
- Don't use fixture data in the UI.
- Show data dates (the season is 2027), never the wall clock, except for `computedAt` and notification times, and label those clearly.

## Routing

The app uses a hash router (`src/web/lib/router.tsx`). The registry (`pages/registry.tsx`) maps a pattern to a component:

| Page | Pattern | Component | Region switch |
|---|---|---|---|
| Overview | `#/` | `OverviewPage` | yes |
| Live season | `#/season?crop=pea` | `SeasonPage` | yes |
| Map | `#/map` | `MapPage` (wide) | yes |
| Farm detail | `#/farm/:farmId?` | `FarmPage` | no |
| Weather | `#/weather/:cellId?` | `WeatherPage` | yes |
| Assistant | `#/assistant` | `AssistantPage` | no |
| Data & provenance | `#/data` | `DataPage` | no |
| Services | `#/services/:embed?` (`c3`, `streamlit`) | `ServicesPage` (wide) | no |

Every page receives `{ params, query }` (`PageProps`). The router helpers are:

- `href("/farm/F0001")` returns `"#/farm/F0001"`. Use it in `<a href>` or `<Link to>`.
- `navigate(path, query?)` goes to a route.
- `setQuery({crop: "pea"})` updates the current query and replaces the history entry by default. Use the query for tabs and filters, so links can be shared.

## Data access (`src/web/lib`)

```tsx
import { api } from "../lib/api";
import { useApi, POLL } from "../lib/usePoll";
import { useRegion } from "../lib/prefs";

const [region] = useRegion();                       // "FI_SW" | "SE_SKANE" | "both"
const preds = useApi((s) => api.predictions({ region, crop }, s), [region, crop], { intervalMs: POLL.predictions });
// preds: { data, error, loading, updatedAt, refresh }
```

- **`api`**: one typed function per server route. The response types are in `src/shared/types.ts`. Every data response includes `fetchedAt` and may include `cached`, `stale` and `errors` (partial upstream failure). Errors throw `ApiError {status, message, upstream?}`.
- **`useApi(fetcher, deps, {intervalMs?, enabled?})`** aborts on change or unmount, pauses polling while the tab is hidden, and keeps old data while it refreshes. The contract's poll rates are services 10 s, predictions and overview 30 s, and everything else on navigation.
- **App-wide data (`lib/appData.tsx`)**: `useServices()` (polls every 10 s), `useOverview()` (every 30 s) and `useSeason()`. The shell already polls these, so pages should reuse them and not poll `/api/services` or `/api/overview` themselves.
- **Preferences (`lib/prefs.tsx`)**: `useRegion()`, `usePrefs().theme` and `useIsDark()`, which is needed for canvas and Leaflet colours. Finland and Sweden are separate operations, so never pool KPIs across regions. With "Both", show the regions side by side.
- **`lib/format.ts`**: `fmtNum`, `fmtFixed`, `fmtCompact`, `fmtHa`, `fmtTonnes`, `fmtTHa`, `fmtDelta` (signed, e.g. "+4.2 %"), `fmtShare`, `fmtDate` (data dates, e.g. "27 Oct 2027"), `fmtDayMonth`, `fmtDateTime` / `fmtTime` / `fmtAgo` (wall-clock timestamps), `shortHash`, `cropLabel`, `regionLabel`.
- **`lib/chatClient.ts`**: `streamChat(messages, {onEvent, signal, provider?, model?})` posts to `/api/chat` and parses the SSE stream. It already compacts history: tool output is truncated to 8,000 characters and only the last 12 user turns are kept. Leave out `model` so the bot's default (sonnet) is used. An abort throws `AbortError`, which the caller should catch.
- **`src/shared/chat.ts`**: the `Msg`, `ToolCall`, `ToolResult` and `AgentEvent` types, `STARTER_PROMPTS`, `toolLabel(name)` and `TOOL_RESULT_DISPLAY_CHARS` (4,000).
- **`src/shared/aggregate.ts`** (pure, usable in pages): `filterPredictions`, `cropSummaries`, `farmSummaries`, `needsAttention(rows, 5)`, `weightedMean`, `latestAsOf` and `BELOW_BASELINE_PCT` (-5).

## UI primitives (`src/web/components/ui`, import from `../components/ui`)

- **`PageHeader`** is the h1 at the top of every page, with a subtitle and actions.
- **`Card`** is a plain surface. **`Panel`** is a card with `title`, `subtitle`, `actions` and a padded body.
- **`Stat`** is a KPI tile with `label`, `value`, `unit`, `delta`, `foot` and `source`. `source` becomes the hover text (contract §7.3, e.g. "YieldPrediction · computed 7 Nov 15:58 · model 5cf88f33").
- **`Badge`** takes a tone: `neutral`, `brand`, `rapeseed`, `berry`, `up`, `degraded` or `down`. **`StatusDot`** and **`StatusBadge`** use a glyph as well as colour. **`DeltaBadge`** shows a signed Δ%.
- **`Segmented`** is a radio-group control, used for tabs, toggles and crop pickers.
- **`Button`** and **`LinkButton`** take a variant: `primary`, `secondary`, `ghost` or `danger`. Set `external` on a `LinkButton` to open in a new tab.
- **`Table`** takes `columns: Column<R>[]` with `render`, `align` and an optional `sortValue` (which makes the column sortable). It also accepts `rowKey`, `onRowClick`, `initialSort`, `maxHeight`, `empty` and `dense`.
- **State components:** `Loading`, `Skeleton`, `EmptyState`, `ErrorState` (shows the upstream's name and a link to Services), `UpstreamBanner {errors, stale}` (for envelopes with partial data) and `Async {state}{(data) => ...}`, which handles loading, error and data in one place.
- **`Drawer`** is a right-side panel that becomes a full-width sheet on phones. Use it for the map side panel and the "Source" drawer. **`JsonBlock`** is a pretty-printed JSON block.

## Charts (`src/web/charts`, import from `../charts`)

All charts are hand-written SVG that measures its own width (`useMeasure`), so set the width with the container.

- **`BarChart`** takes `data: BarDatum[]` (`key`, `label`, `value`, `color?`, `detail?`), `orientation`, `format`, `onSelect` and `domain`. It handles negative values around zero.
- **`LineChart`** takes `series: Series[]`. Each series has `kind` (`"line"`, `"band"` with `lo`/`hi` per point, or `"bars"`) and can set `dashed` and `quiet`. The chart also takes `xType: "time"` with `dateX("2027-06-01")` for x values, `markers` (vertical lines), `formatX`/`formatY`, `yDomain` and `includeZero`. Example: weather is a temperature band, a mean line and precipitation bars.
- **`SmallMultiples`** takes `{panels: [{id, title, subtitle?, render(width)}]}`. **`Sparkline`** takes `values`, `width`, `reference?` (a dashed baseline) and `domain?`.
- **`CompletenessBar`** takes `observed`, `filledGap`, `filledAhead` and `total`. Observed is drawn in brand green, gap-filled in rapeseed and filled-ahead hatched.
- **`BulletBar`** takes `estimate`, `baseline` and `max`. Use the same `max` across a row so the bars compare. The bar is coloured by Δ and the baseline is drawn as a tick. **`DeltaLegend`** draws the diverging scale's legend.
- **`TableToggle {table, toolbar}`** wraps a chart in a "Chart | Table" switch. Every chart should have one (contract §7.3).
- **`Legend`**, **`Key`** and **`ChartTooltip`** are chart building blocks. **`Gridlines`**, **`XAxis`** and **`YAxis`** are axis parts. `linearScale`, `bandScale`, `extent`, `linePath` and `bandPath` are scale and path helpers.
- **Colours (`charts/colors.ts`):**
  - `cropColor(crop)` returns a CSS variable and `cropHex(crop, dark)` returns a hex value.
  - `deltaColor(pct, dark)` returns the earthy BrBG hex colour, clamped at ±25 %.
  - `VIZ` holds the CSS variables for estimate, baseline, temperature, precipitation, ET0 and completeness. `SCENARIO_COLOR` maps historical and the SSPs.
  - For canvas or Leaflet, use the hex helpers or `cssVar("--brand")`.

## Theme (`src/web/styles.css`)

The tokens are CSS variables on `:root`, with dark-mode overrides under `.dark` (a class on `<html>`, set before first paint). In Tailwind they're available as:

| Use | Classes |
|---|---|
| Backgrounds | `bg-bg`, `bg-surface`, `bg-surface-2` |
| Text | `text-ink` (body), `text-muted` |
| Borders | `border-border` |
| Brand | `bg-brand`, `text-brand`, `bg-brand-soft`, `text-brand-strong`, `text-brand-contrast` (text on brand) |
| Accents | `bg-rapeseed`, `bg-rapeseed-soft`, `text-berry`, `bg-berry-soft` |
| Status | `text-up`, `text-degraded`, `text-down` |
| Shape and type | `rounded-card`, `shadow-card`, `font-serif` (display), `.tnum` (tabular figures), `.hatch` (hatched fill) |

In SVG, use `var(--viz-*)` directly.

## Server API (already built, `src/server`)

The routes are exactly as in CONTRACT §5.3. Everything else returns 404 (unknown path) or 405 (wrong method).

- **Partial data:** aggregate routes (`/api/overview`, `/api/broker/farms/:id`) return `errors: {broker?, inference?}` when only part of the data loaded.
- **Upstream failures:** a single-source route answers `503 {error, upstream}` when the upstream is unreachable and `502` when it returns an error. With a stale cache it still answers `200` with `stale: true`.
- **Data source:** `/api/live/*` reports `source: "backend" | "inference"`.
- **Write-back count:** the backend strips `writeback.written`, so `pipeline.writeback.written` is null when the backend is the source. Use `pipeline.writeback.yieldPredictions` (the broker count) for "N written".
- **Dev only:** `POST /api/cache/clear` clears the server cache.

## Checks

Run `bun test`, `bun run typecheck` and `bun run build` before you hand over. The server runs with `bun dev` on port 3300. Stop any server you started.
