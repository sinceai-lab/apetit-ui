# Apetit UI contract

This file is the one source of truth for building `apetit-ui`. Every upstream shape here was captured from the live services on 2026-11-07, and the matching real responses (trimmed) are in `docs/samples/`. If this file and a sample disagree, the sample is right. Fix this file.

- App: Bun + React 19 + TypeScript + Tailwind v4, served by `Bun.serve` with an HTML import (same pattern as `../frontend/src/index.ts`). Port `PORT` (default **3300**).
- The browser only talks to the app server (`/api/*`). None of the upstreams send CORS headers for `:3300`, so the browser can't call them directly. The backend's CORS allowlist actually rejects `http://localhost:3300` with a 400.
- The app is **read-only** against the broker, inference and backend. The only POST is the chat pass-through.
- Live data only. Don't ship fixture data in the UI. `docs/samples/` is for tests only.

---

## 1. Upstream services

| id | Name | Base URL | What it is | Health URL the server polls | OK when |
|---|---|---|---|---|---|
| `broker` | Coraine NGSI-LD broker 0.7.0 | `http://localhost:1026/ngsi-ld/v1` | Context broker that holds all loaded CSV data plus weather and predictions | `http://localhost:1026/version` | 200, JSON `{product:"coraine",version}` |
| `inference` | Yield inference service (FastAPI) | `http://127.0.0.1:8600` | Gets WeatherObserved notifications, computes in-season yield estimates and writes them back as `YieldPrediction` | `/health` | 200 and `status=="ok"` and `models.load_error==null` |
| `backend` | sinceai backend (FastAPI) | `http://127.0.0.1:8000` | Token-protected relay of inference (`/api/live/*`) | `/health` (no token) | 200 `{"status":"ok"}` |
| `chatbot` | FIWARE chat-bot (Express, Docker) | `http://localhost:3006` | LLM agent over the MCP server, with an SSE chat API | `/api/me` | 200 |
| `mcp` | FIWARE MCP server (Docker) | `http://localhost:3003` | MCP tools over the broker, used by the chat-bot. The UI never calls it | `/health` | 200, text `✓ Ok` |
| `c3` | c³ Control Center (Seamware) | `http://localhost:7900` | Broker explorer: entity graph, map, live values | `/` | 200 (HTML) |
| `streamlit` | Apetit yield model viewer (Streamlit) | `http://localhost:8501` | The model team's analysis app (risk, farm, map, live, trust tabs) | `/_stcore/health` | 200, text `ok` |
| `keycloak` | Keycloak 24 | `http://localhost:3005` | OIDC for APISIX (realm `farm-management`) | `/health/ready` (fallback `/realms/farm-management`) | 200 |
| `apisix` | APISIX 3.9 gateway | `http://localhost:1030` | Secured route `/coraine/*` to the broker (Keycloak bearer) | `/health` | 200 `{"status":"ok"}` (mocked route) |
| `weather` | weather-aggregator | `http://localhost:3200` | Subscribes to WeatherObserved and logs notifications. Only `POST /notify` and `GET /health` exist | `/health` | 200, empty body |
| `context` | JSON-LD @context (httpd) | `http://localhost:3004` | Serves `user-context.jsonld` and `schemas/` | `/user-context.jsonld` | 200 |
| `legacy` | Old frontend (bun dev) | `http://localhost:3000` | Previous UI. List it as "legacy", no embed | `/` | 200 |

Docker also runs Mongo (:27017) and Timescale (:5432), which are broker storage with no HTTP. The services page can show them as "storage (not polled)" or TCP-probe them with `Bun.connect`. That part is optional.

### Can it be iframed?

I checked `X-Frame-Options` and `Content-Security-Policy` on every UI service. **None of them send either header**, so all can be iframed from `localhost:3300`.

- **C3** (`http://localhost:7900/`): embed it. Its broker entry `http://coraine:1026` is resolved server-side inside Docker, so it works in an iframe. The user still presses **Connect** in its Explore tab. It is a dense tool UI, so give it the full content area (min-height 80vh) plus an "Open in new tab" link.
- **Streamlit** (`http://localhost:8501/?embed=true`): embed it. `embed=true` hides Streamlit's own chrome. Streamlit needs a websocket to `:8501`, so **iframe it directly. Don't proxy it** through the app server.
- **Chat-bot web UI** (`:3006`): don't embed it. We build a native, themed chat over its API (§4).
- Keycloak admin, APISIX and the rest: link only.

---

## 2. Coraine broker: what was observed

### 2.1 General

- Coraine runs with `--defaultUserContext`, so **short attribute names work without a `Link` header**. Every response carries `Link: <http://context/user-context.jsonld>`. Don't send a context.
- No CORS headers, and `OPTIONS` returns 204 with only `Allow`.
- `GET /entities` without `limit` returns **20**. Coraine accepts large limits: `limit=5000` returned 5000, and `limit=20000` returned all 14,213 parcels. There is no 1000 cap. Still page at **≤ 5000** to keep memory flat.
- Pagination: `offset` works, and `count=true` sets the `NGSILD-Results-Count` header. Responses also carry a `Link: <...&pageAfter=<cursor>>; rel="next"` cursor. Use offset or limit and ignore the cursor.
- **Count without data:** `?type=X&limit=0&count=true` gives the body `[]` plus the count header. All six counts together take under 100 ms. Multi-type works too: `type=Farm,Parcel`.
- Supported and tested: `q` with `==`, `>=` and `;` (AND), including on Relationships (`q=farm_id=="urn:ngsi-ld:Farm:F0001"`); `attrs=a,b`; `options=keyValues`; `idPattern=<regex>`; `id=a,b`; `georel=near;maxDistance==5000&geometry=Point&coordinates=[lon,lat]`; `orderBy=<attr>`; `GET /entities/{id}` (404 body `{type,title,status,detail}` in NGSI-LD error form).
- **Order isn't guaranteed.** The WeatherObserved results for one cell came back out of date order, so always sort on the client or server.
- Sizes: all parcels as keyValues are 6.4 MB (0.6 s). With `attrs=parcel_id,farm_id,crop,area_ha,location` it's 2.9 MB (0.45 s). Normalized is about 3x larger. **Always use `options=keyValues` plus `attrs`** except on the provenance view.
- `GET /types` returns `{typeList:[...30 names]}` (`samples/broker-types.json`). Types in the UI's scope, with counts on 2026-11-07:

| Type | Count | Notes |
|---|---:|---|
| Farm | 680 | 380 FI_SW (ids `F####`), 300 SE_SKANE (ids `S####`) |
| Parcel | 14,213 | point locations only, no polygons |
| ClimateGridCell | 84 | 36 FI_SW and 48 SE_SKANE, 0.25° grid |
| WeatherObserved | 20,580 | 84 cells × 245 days (2027-03-01..2027-10-31), all `ssp245` |
| YieldPrediction | 2,465 | written back by inference. All `seasonYear` 2027, label `estimate` |
| LoadLog | 41 | one per loaded CSV, all `complete` |

The other types (Site, Material, Supplier, EmissionFactor, Catchment, ...) belong to the GHG and nature tracks. They are out of scope for this UI apart from counts on the Data page.

### 2.2 Attribute naming and provenance

- CSV-loaded types (Farm, Parcel, ClimateGridCell, LoadLog) use the **CSV column names in snake_case** (`farm_id`, `area_ha`, `cell_id`). Pipeline-written types (WeatherObserved, YieldPrediction) use **camelCase** (`cellId`, `dateObserved`, `estimatedYield`).
- In normalized form, every CSV-loaded attribute carries a sub-relationship `refLoadLog: {type:"Relationship", object:"urn:ngsi-ld:LoadLog:<ms>-<sha8>"}`. This is the provenance link: an attribute traces to its LoadLog, which traces to the file and its sha256. Attributes from a second file (for example Farm survey data) point to a different LoadLog than the base attributes.
- Units sit in normalized `unitCode` (`HAR` = ha, `MTR`, `MMT` = mm, `CEL`, `DAY`) or, on YieldPrediction, in a sub-property `unitText:{value:"t/ha"}`. keyValues drops them, so the UI hard-codes units per field.

### 2.3 Farm (`samples/broker-Farm-keyValues.json`, `broker-Farm-SE-keyValues.json`, `broker-Farm-normalized.json`)

keyValues keys: `id, type, farm_id, farm_segment ("veg"|"oil"|"se_pea"), region ("FI_SW"|"SE_SKANE"), country ("FI"|"SE"), organic_certified, livestock, joined_year, contract_crops, location{type:"Point",coordinates:[lon,lat]}`. Survey and contract attributes only exist on some farms and are **per-crop maps**:

```json
"area_ha": {"pea": 12.31}, "yield_t_ha": {"pea": 3.46}, "irrigated": {"pea": false},
"diesel_l_ha": {...}, "n_mineral_kg_ha": {...}, "carbon_footprint_kgco2e_per_kg": {...}, ...
```

Things to watch for (the planted raw-data issues are deliberate, so normalize them and don't fix them upstream):

- `contract_crops` is a `;`-joined string (`"pea"`, `"carrot;pea;spinach"`) and is **missing on 23 farms**. Split on `;`.
- **SE farms** use the Swedish crop key `ärt_frysärt` (frozen pea, which maps to `pea`). Their values are **strings with decimal commas** (`"9,59"`) and `"nej"`/`"ja"` booleans. Normalize with `toNum(v) = typeof v === "string" ? parseFloat(v.replace(",", ".")) : v` and `ja→true`, `nej→false`.
- 357 farms have the full FI survey set (`fertiliser_product`, `sprays`, `calculator_note`, ...). 300 SE farms have `delivered_tonnes` and `n_applied_kg_ha` instead.

### 2.4 Parcel (`samples/broker-Parcel-*.json`)

keyValues: `parcel_id, farm_id ("urn:ngsi-ld:Farm:F0001", a Relationship), area_ha, soil_class_soilmap, clay_pct_soilmap, slope_pct, dist_to_water_m, drainage ("open_ditch"|"subsurface"), catchment_id (a Relationship to Catchment), p_test_mgl_latest (optional), buffer_strip, catch_crop, crop, crop_plan_status ("planned"), location Point`.

- In normalized form `farm_id` is `{type:"Relationship", object:"urn:ngsi-ld:Farm:F0001", originalValue:{value:"F0001"}}`. keyValues collapses it to the URN.
- `crop` values are barley 4009, wheat 3791, grass_ley 1654, oats 1432, pea 1296, turnip_rape 985, fallow 902, spinach 57, potato 55 and carrot 32. Only the last five plus pea are Apetit contract crops.
- **Surprise:** `Parcel.crop` **doesn't match** the prediction crop for 1,615 of 2,465 predictions. Predictions come from the inference service's own contract plan, not from `Parcel.crop`. **Always take the crop from the prediction.** Use `Parcel.crop` only as "planned rotation crop" on parcel detail.

### 2.5 ClimateGridCell (`samples/broker-ClimateGridCell-*.json`)

keyValues: `cell_id ("GF0000"), region, continentality, elevation_m, location Point`. It also has monthly climate attributes **nested by scenario**: `tmean_c, tmax_c_max, precip_mm, pet_mm, hot_days_tmax_ge_27`. The current value (keyValues) is the **latest instance**, 2060-12, as `{"ssp126":x,"ssp245":y,"ssp585":z}`. That value is not useful on its own. Use the temporal API (§2.9).

Bounding boxes (cell centres): FI_SW lon 21.625–23.625, lat 60.725–61.475. SE_SKANE lon 12.625–14.375, lat 55.525–56.775. Cells are 0.25°, so draw each as a square of ±0.125° around its centre.

### 2.6 WeatherObserved (`samples/broker-WeatherObserved-*.json`)

id `urn:ngsi-ld:WeatherObserved:<cell>:<scenario>:<YYYY-MM-DD>`. keyValues: `cellId, dateObserved ("2027-06-01", a plain string), climateScenario ("ssp245"), temperature, temperatureMax, temperatureMin, precipitation, referenceEvapotranspiration`. Units are °C and mm/day. **There's no `location`**, so join to ClimateGridCell by `cellId`. One cell is `q=cellId=="GF0104"` with `limit=1000`, giving 245 rows. Sort by `dateObserved`. These are replayed "live" readings of the simulated **2027** season. The data's "today" is about **2027-10-31**, not the wall clock. Always show the data's own dates.

### 2.7 YieldPrediction (`samples/broker-YieldPrediction-*.json`)

id `urn:ngsi-ld:YieldPrediction:<parcel_id>:<crop>:<year>`. keyValues:

```json
{"refParcel":"urn:ngsi-ld:AgriParcel:F0001-P03", "refGridCell":"urn:ngsi-ld:ClimateGridCell:GF0104",
 "cropName":"pea", "seasonYear":2027, "predictionLabel":"estimate", "estimatedYield":3.962, "baselineYield":3.052,
 "modelName":"models[pea]", "modelVersion":"5cf88f338cb8", "observedDays":241, "filledDays":0, "filledGapDays":0,
 "filledFutureDays":0, "asOfDate":{"@type":"Date","@value":"2027-10-27"},
 "computedAt":{"@type":"DateTime","@value":"2026-11-07T15:58:11.662+00:00"}}
```

- **`refParcel` points at `AgriParcel`, a type that doesn't exist.** Join to Parcel by parsing the id: `const [, , , parcelId, crop, year] = id.split(":")`, which gives `urn:ngsi-ld:Parcel:${parcelId}`. The farm is `parcelId.split("-P")[0]` (`F0001-P03` → `F0001`). Querying `q=refParcel=="urn:ngsi-ld:AgriParcel:F0001-P03"` does work. Per farm: `idPattern=urn:ngsi-ld:YieldPrediction:F0001-.*`.
- `asOfDate` and `computedAt` come back in keyValues as **JSON-LD typed literals** `{"@type","@value"}`. Unwrap them with `v?.["@value"] ?? v`.
- Units are t/ha and only exist in normalized form (`unitText`). `baselineYield` = the farm's historical mean for that crop. It can be missing (the engine writes null for NaN), so treat it as optional.
- There's no area, farm or region on the entity. Area comes from Parcel (or inference). Region comes from the cell (`refGridCell`) or the farm id prefix (`F` = FI_SW, `S` = SE_SKANE).
- The broker holds only the **latest** estimate per parcel, crop and year. History lives in inference (`/predictions` without `latest`).

### 2.8 LoadLog (`samples/broker-LoadLog-*.json`)

`schema` (target type or CSV schema name), `originalName`, `storedPath` (a local absolute path, so **don't show it** and strip it on the server), `sha256`, `loadedBy`, `loadedAt` (ISO), `rowsRead`, `rowsLoaded`, `rowsDropped`, `rowsRejected`, `loadStatus`. The 41 logs cover 41 CSV schemas. No LoadLog exists for WeatherObserved or YieldPrediction, because those arrive through replay and write-back.

### 2.9 Temporal API (`samples/broker-temporal-ClimateGridCell-*.json`)

`GET /temporal/entities/{id}` works on ClimateGridCell and returns every instance (each monthly attribute has 840 instances, about 1.1 MB for all attributes). The value shape **switches over time**:

- 1991-01 .. 2026-12 (432 months): `value = {"historical": x}`
- 2027-01 .. 2060-12 (408 months): `value = {"ssp126": x, "ssp245": y, "ssp585": z}`

Use the compact form, which is tested and works:

```
GET /temporal/entities/urn:ngsi-ld:ClimateGridCell:GF0104
    ?attrs=tmean_c,precip_mm,pet_mm&options=temporalValues
    &timerel=between&timeAt=2026-01-01T00:00:00Z&endTimeAt=2027-07-01T00:00:00Z
→ {"id":..,"type":..,"precip_mm":{"type":"Property","values":[[{"historical":20.7},"2026-01-01T00:00:00Z"],...]}, ...}
```

`lastN=3` also works and returns the newest first. `observedAt` is the first of the month. WeatherObserved entities are one entity per day, so they have no useful temporal history. Use the entity query instead (§2.6).

### 2.10 Subscriptions (`samples/broker-subscriptions.json`), read-only

There are two, both on `entities:[{type:"WeatherObserved"}]`, normalized, triggered by `attributeCreated` and `attributeUpdated`:

- `urn:ngsi-ld:Subscription:weather-aggregator` notifies `http://weather-aggregator:3200/notify`
- `urn:ngsi-ld:Subscription:apetit-yield` notifies `http://host.docker.internal:8600/notify` (the inference service)

Each has `notification.{timesSent, lastNotification, lastSuccess, status:"ok"}` and `status:"active"`. Use these for the pipeline strip ("weather to inference link healthy, last push at ...").

---

## 3. Inference (127.0.0.1:8600) and backend (127.0.0.1:8000)

### 3.1 Inference endpoints (no auth, no CORS)

- `GET /health` (`samples/inference-health.json`) returns `{status, started_at, models:{path, version, crops[], load_error}, store:{path, observations, predictions, rejected}, counters:{notifications, readings_new, readings_out_of_season, readings_duplicate}, last_notification:{id, subscription_id, notified_at, received_at, ...}, fill_counts, writeback:{enabled, url, written, last_error, pending}}`. **It contains local paths and URLs, so strip `models.path`, `store.path` and `writeback.url` server-side.**
- `GET /predictions` takes `cell_id, parcel_id, farm_id, crop, year, latest (bool, default false), limit (1..100000, default 1000!), include_features`. It returns `{count, label:"estimate", predictions:[...]}`. **The default limit of 1000 cuts the list short. Always pass `limit=100000`.** Live: `latest=true` gives 2,465 rows. Without `latest` you get 3,731 rows, which includes history at earlier `as_of_date`s (sparse, from the backfill).
  Prediction row (`samples/inference-predictions-latest.json`):
  ```
  parcel_id, crop, year, as_of_date, farm_id, cell_id, status ("planned"), area_ha, yield_t_ha (full float),
  baseline_t_ha (nullable), model_name, model_version, technology_year, label ("estimate"),
  observed_days, partial_days, filled_days, filled_gap_days, filled_future_days, total_days, filled_to_maturity,
  sow_doy, mat_doy, out_of_training_range (string[] e.g. ["mat_doy","t_sens"]), computed_at, synced_at
  ```
  This is **richer than the broker entity** (it has area_ha, farm_id, cell_id, out_of_training_range, sow and maturity day). Use it as the primary source for "Live season".
- `GET /observations/status` (`samples/inference-observations-status.json`) takes `cell_id` and `year` and returns `{seasons:[{cell_id, year, stored_days, in_window_days, first_date, last_date, duplicates, corrections, pet_derived_days, last_received_at, observed_days, partial_days, filled_days, filled_gap_days, filled_future_days, total_days, last_observed_doy, label, missing_doys_before_last[], contract_parcels}], recent_rejected:[...], counters:{...}}`. There are 84 seasons, and `contract_parcels` sums to 2,465. **The backend doesn't relay this**, so call inference directly.
- Mutating routes exist (`POST /notify`, `POST /predict`, `POST /predict/field`, `DELETE /observations`). **Never call them.**

### 3.2 Backend

- `GET /health` (no token) returns `{"status":"ok"}`.
- `GET /api/live/health` (Bearer) is the inference health **with paths and URLs already removed** (`writeback:{enabled,pending,has_error}`). Sample: `samples/backend-live-health.json`.
- `GET /api/live/predictions` (Bearer) passes `cell_id, parcel_id, farm_id, crop, year, latest (default true), limit` through to inference. The shape is identical to §3.1. If inference is down it returns `503 {"detail":"inference service unavailable"}`.
- Without a token both return 401.
- **Token:** `API_TOKEN` in `../backend/.env`. Copy it programmatically into `apetit-ui/.env` as `BACKEND_TOKEN` and never print it, for example `grep '^API_TOKEN=' ../backend/.env | sed 's/^API_TOKEN=/BACKEND_TOKEN=/' > .env`. Bun loads `.env` automatically. `.env` must be in `.gitignore`. Only the server reads it. Never send it to the browser and never put it in a `BUN_PUBLIC_*` variable.
- Policy: use the backend for predictions and live health, since that's the "official" path. **Fall back to inference direct** if the backend is down or no token is set, and say which source was used in the response (`source: "backend"|"inference"`).

---

## 4. Chat-bot (localhost:3006): exact protocol

Source: `cb-dataloader/data-viewer/chat-bot/src/{server/index.ts, server/agent.ts, shared/types.ts, web/api.ts, web/App.tsx}`. Live config: **auth disabled** (`/api/me` gives `{"authEnabled":false,"user":null,"roles":[]}`), default provider `anthropic`, default model `claude-sonnet-5-5`.

### 4.1 Routes

| Method | Path | Request | Response |
|---|---|---|---|
| GET | `/api/me` | none | `{authEnabled:boolean, user:string\|null, roles:string[]}`. 401 if auth is on and the user isn't signed in |
| GET | `/api/providers` | none | `{providers:[{id, models:string[], default:string}], default:string}`. Live: `anthropic` (14 models, default `claude-sonnet-5-5`) and `ollama` (`qwen2.5:3b`). See `samples/chatbot-providers.json` |
| GET | `/api/prompts` | none | `{prompts:[{name, description?}]}`. Live: **empty** `[]` |
| POST | `/api/chat` | JSON `{messages: Msg[], provider?: string, model?: string}` | **SSE stream** (below). 400 `{error}` for an unknown provider. 401 `{error}` if the MCP session fails |
| GET | `/login`, `/login/callback`; POST `/logout` | | OIDC flow, used only when `AUTH_ENABLED=true` |

There's no CORS (an OPTIONS preflight gets 200 with an `Allow` header and no ACAO), so the browser must go through our proxy.

### 4.2 Conversation model: stateless, the client owns history

There's no conversation id. **Every POST carries the whole history** as provider-agnostic `Msg[]`:

```ts
type ToolCall   = { id: string; name: string; args: Record<string, unknown>; extra?: unknown };
type ToolResult = { id: string; content: string; isError: boolean };
type Msg =
  | { role: 'user'; text: string }
  | { role: 'assistant'; text: string; toolCalls?: ToolCall[] }
  | { role: 'tool'; results: ToolResult[] };
```

The reference client rebuilds history from its displayed turns (`wireHistory` in `web/App.tsx`). A run of consecutive tool turns becomes `{role:'assistant', text:'', toolCalls:[...]}` followed by `{role:'tool', results:[...]}`, and assistant text becomes `{role:'assistant', text}`. Keep `extra` on a ToolCall unchanged, because Gemini needs it echoed back. The server keeps an express-session cookie (`connect.sid`) only to pool one MCP connection per browser session (30 min idle). With `saveUninitialized:false` and auth off, no cookie is set. Forward `Cookie` and `Set-Cookie` through the proxy anyway so auth can be turned on later.

### 4.3 Stream format

Response headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`, `Transfer-Encoding: chunked`. Each event is exactly one line `data: <json>\n\n`. There are no `event:` or `id:` fields and **no heartbeats**. The stream always ends with `{"t":"end"}` and then the connection closes.

```ts
type AgentEvent =
  | { t: 'token'; text: string }               // streamed assistant text delta
  | { t: 'assistant_done'; text: string }      // end of one LLM step; text = full text of that step (often "" before tool calls)
  | { t: 'tool_call'; call: ToolCall }         // agent is calling an MCP tool
  | { t: 'tool_result'; result: ToolResult }   // result for call.id (content is a string, often pretty JSON, can be 10–70 KB)
  | { t: 'error'; message: string }            // agent stopped (e.g. "Stopped after 3 consecutive failed tool calls") or provider error
  | { t: 'end' };
```

Parse it with `fetch` plus a `ReadableStream` reader. `EventSource` can't do POST. Split the buffer on `\n\n`, strip `data: `, then `JSON.parse`. This is the same as `web/api.ts`.

**Observed live run** ("How many farms are there? Answer in one short sentence.", 6.7 s, 78 KB raw because of tool output). Trimmed sample in `samples/chatbot-chat-events.json` and `samples/chatbot-chat-raw.sse`:

```
assistant_done ""  →  tool_call discover_context_meta_data {compact:true}  →  tool_result (types list, ~70 KB)
assistant_done ""  →  tool_call query_entities {entityType:"Farm", metadataOnly:true}  →  tool_result {"pagination":{"total":680,...}}
token × 10  →  assistant_done "There are 680 Farm entities in the broker. ..."  →  end
```

Agent behaviour that affects the UI:

- Up to 40 steps. The server may silently add a hidden "keep going" user nudge (it's never streamed), so one request can produce several `assistant_done` events, some with empty text.
- Tools come from the MCP server (`discover_context_meta_data`, `query_entities`, ...) plus two synthetic ones, `list_data_models` and `read_data_model`. The agent is read-only as deployed: the MCP write tools are hidden by role.
- Answers are Markdown (GFM tables are common).

### 4.4 Rendering rules for our Assistant page

1. `token`: append to the current assistant bubble. Open a bubble on the first token after a user turn or a tool call.
2. `assistant_done`: close the current bubble. **Don't render an empty bubble** for `text===""`.
3. `tool_call`: add a compact, collapsible "step" chip under the conversation, with a friendly label (`query_entities` → "Looking up entities", `discover_context_meta_data` → "Checking what data exists", `read_data_model`/`list_data_models` → "Reading the data model", anything else → the tool name). It has a spinner state.
4. `tool_result`: match on `result.id === call.id` and set ok or error. The expanded view shows `args` (pretty JSON) and `content` **truncated to about 4,000 chars** with a "show all" toggle.
5. `error`: an inline warning bubble (berry tone), not an exception.
6. `end`, or the stream closing: re-enable input. A user "Stop" button aborts the fetch (`AbortController`), and the proxy must propagate the abort upstream.
7. Show a "thinking" indicator whenever we're waiting with no open text bubble.
8. Render Markdown. A light renderer is OK (headings, lists, bold, code, tables), or add `react-markdown` + `remark-gfm` (the reference client uses them, and that's an acceptable dependency).
9. Starter prompts, since `/api/prompts` is empty. Hard-code 4–6 Apetit ones, for example "How many contract farms grow pea in Finland?", "Which grid cells have the most contract parcels?", "Show the yield estimate vs baseline for farm F0001", "What does a Parcel record contain?".
10. **Cost control:** each message re-sends the full history, including tool results. When building history, **truncate every `ToolResult.content` to 8,000 chars**, cap the history at the last 12 user turns, and add a "New chat" button. Default to `provider` = the `/api/providers` default and **omit `model`**, so the server default is used. The reference client wrongly picks `models[0]` (haiku). An optional model picker can live in a small settings popover.

### 4.5 MCP server (:3003)

`http://localhost:3003/mcp` is the streamable-HTTP MCP endpoint. A bare GET returns `400 No sessionId`, and `/health` returns `✓ Ok`. The UI doesn't talk to it directly. It only appears on the Services page as an upstream of the chat-bot.

---

## 5. App server API (what the UI codes against)

Every route is `GET` unless noted, returns JSON `application/json`, and has no auth (localhost tool). On upstream failure the response is `502 {error:string, upstream:"broker"|"inference"|"backend"|"chatbot"}`. Every data response includes `fetchedAt` (ISO, server time) and, when cached, `cached:true`.

**Bun.serve settings that matter:** set `idleTimeout: 255` (the max). The default is 10 s, which kills a silent SSE chat stream while a long tool call runs. For `/api/chat` you can also call `server.timeout(req, 0)`. Don't compress `/api/chat`.

### 5.1 Server-side cache

An in-memory Map with TTL, single-flight (concurrent misses share one upstream fetch), and stale-while-error (serve the last good value with `stale:true` if the upstream fails).

| Key | Upstream | TTL |
|---|---|---|
| farms | Farm keyValues, all (`limit=1000`) | 10 min |
| parcels | Parcel keyValues `attrs=parcel_id,farm_id,crop,area_ha,soil_class_soilmap,drainage,catchment_id,location` paged by `limit=5000` | 10 min |
| cells | ClimateGridCell keyValues `attrs=cell_id,region,elevation_m,continentality,location` | 10 min |
| predictions | backend `/api/live/predictions?latest=true&limit=100000` (falls back to inference) | 30 s |
| status | inference `/observations/status` | 30 s |
| weather:{cell} | WeatherObserved `q=cellId=="X"` limit 1000 | 2 min |
| climate:{cell}:{attrs}:{from}:{to} | temporal (§2.9) | 1 h |
| counts | `limit=0&count=true` per type | 30 s |
| services | health polls | 10 s (poll on demand, timeout 2.5 s each, run in parallel) |

`POST /api/cache/clear` is optional (dev only).

### 5.2 Shared types (`src/shared/types.ts`)

```ts
type Region = 'FI_SW' | 'SE_SKANE';
type Crop = 'pea' | 'turnip_rape' | 'potato' | 'carrot' | 'spinach';
type LngLat = [number, number];                      // [lon, lat], GeoJSON order

interface Farm {
  id: string; farmId: string; region: Region; country: 'FI' | 'SE'; segment: string;
  organic: boolean; livestock: boolean; joinedYear: number | null;
  contractCrops: string[];                            // split on ';', 'ärt_frysärt'→'pea'
  location: LngLat;
  perCrop: Record<string, Record<string, number | string | boolean | null>>; // {pea:{area_ha:9.59, irrigated:false,...}} normalized
}
interface Parcel {
  id: string; parcelId: string; farmId: string;       // farmId = 'F0001' (not URN)
  crop: string; areaHa: number; soil: string | null; drainage: string | null;
  catchmentId: string | null; location: LngLat;
}
interface Cell { id: string; cellId: string; region: Region; elevationM: number; continentality: number; location: LngLat }

interface Prediction {                                // from inference/backend row, camelCased
  parcelId: string; farmId: string; cellId: string; region: Region; crop: Crop | string; year: number;
  asOfDate: string; areaHa: number; yieldTHa: number; baselineTHa: number | null;
  deltaPct: number | null;                            // (yield-baseline)/baseline*100
  modelName: string; modelVersion: string; label: string;
  observedDays: number; filledGapDays: number; filledFutureDays: number; totalDays: number;
  outOfTrainingRange: string[]; computedAt: string;
}
interface ServiceStatus {
  id: string; name: string; group: 'pipeline' | 'ai' | 'tools' | 'platform';
  status: 'up' | 'down' | 'degraded'; latencyMs: number | null; detail: string | null;
  healthUrl: string; openUrl: string | null; embedUrl: string | null; checkedAt: string;
}
```

### 5.3 Routes

| Route | Returns |
|---|---|
| `GET /api/services` | `{services: ServiceStatus[], pipeline: Pipeline, checkedAt}` covering every service in §1. `degraded` = reachable but not healthy (for example inference `models.load_error`, or a subscription `status!="ok"`). |
| `GET /api/overview` | `{counts:{farms,parcels,cells,weatherObserved,yieldPredictions,loadLogs}, season:{year, asOfDate, lastWeatherDate, cellsReporting, cellsTotal}, kpis: CropSummary[] (both regions), pipeline: Pipeline, fetchedAt}` |
| `GET /api/broker/types` | `{types:[{type,count}]}` for all 30 types (counts via `limit=0&count=true`) |
| `GET /api/broker/farms?region=` | `{farms: Farm[]}` |
| `GET /api/broker/farms/:farmId` | `{farm: Farm, parcels: Parcel[], predictions: Prediction[], cell: Cell \| null}`. `farmId` is `F0001` or `S0381`. Parcels via `q=farm_id=="urn:ngsi-ld:Farm:<id>"` (or the cache), predictions from the predictions cache filtered by farmId. Returns 404 `{error}` if not found. |
| `GET /api/broker/parcels?region=&crop=&farm=&fields=min` | `{parcels: Parcel[]}`. With `fields=min`, each parcel is the compact tuple `[parcelId, farmId, crop, areaHa, lon, lat]` (14k parcels as about 0.7 MB) |
| `GET /api/broker/cells?region=` | `{cells: Cell[]}` |
| `GET /api/broker/weather/:cellId?from=&to=` | `{cellId, scenario:"ssp245", days:[{date, tMean, tMax, tMin, precip, et0}]}` sorted ascending |
| `GET /api/broker/climate/:cellId?attrs=tmean_c,precip_mm&from=1991-01&to=2060-12` | `{cellId, attrs:{[attr]: [{month:"2027-01", historical?:n, ssp126?:n, ssp245?:n, ssp585?:n}]}}` built from `temporalValues`. Whitelist the attrs: `tmean_c, tmax_c_max, precip_mm, pet_mm, hot_days_tmax_ge_27`. |
| `GET /api/broker/loadlogs` | `{loadLogs:[{id, schema, file, sha256, loadedBy, loadedAt, rowsRead, rowsLoaded, rowsDropped, rowsRejected, status}]}`, newest first, **`storedPath` removed** |
| `GET /api/broker/subscriptions` | `{subscriptions:[{id, description, entityTypes[], endpoint, status, notificationStatus, timesSent, lastNotification, lastSuccess}]}` |
| `GET /api/broker/entity/:id?options=normalized` | A single raw entity (provenance drawer). Allow only ids matching `^urn:ngsi-ld:(Farm\|Parcel\|ClimateGridCell\|WeatherObserved\|YieldPrediction\|LoadLog\|Catchment):[^/]+$` |
| `GET /api/live/health` | backend `/api/live/health` (falls back to sanitized inference `/health`) plus `{source}` |
| `GET /api/live/predictions?crop=&region=&farm=&cell=` | `{source, count, asOfDate, predictions: Prediction[]}` |
| `GET /api/live/history?parcel=` | inference `/predictions?parcel_id=X&limit=100000` (not latest), giving `{points:[{asOfDate, yieldTHa, baselineTHa, observedDays, filledFutureDays}]}` sorted |
| `GET /api/live/summary?region=` | `{asOfDate, crops: CropSummary[]}` (below) |
| `GET /api/live/observations` | inference `/observations/status` as is (camelCase optional), plus `{source:"inference"}` |
| `GET /api/chat/me`, `/api/chat/providers`, `/api/chat/prompts` | pass-through to `:3006/api/*` |
| `POST /api/chat` | **streaming pass-through** to `:3006/api/chat`: `fetch(upstream, {method:'POST', body: await req.text(), headers:{'content-type':'application/json', cookie}, signal: req.signal})` then `new Response(up.body, {status: up.status, headers:{'content-type':'text/event-stream','cache-control':'no-cache','x-accel-buffering':'no'}})`. Don't buffer, parse or re-encode. Limit the body to 1 MB. |

Anything outside this list (other broker paths, any non-GET to the broker, inference or backend) returns 404 or 405.

```ts
interface CropSummary {
  region: Region; crop: string; parcels: number; farms: number; areaHa: number;
  estTHa: number; baseTHa: number | null;             // area-weighted means (weights = areaHa; baseline over rows with a baseline)
  deltaPct: number | null; estTonnes: number; baseTonnes: number | null; // Σ yield*area
  belowBaselineShare: number;                         // share of area with deltaPct < -5
  completeness: { observedDays: number; totalDays: number; filledFutureDays: number }; // modal values
  outOfRangeShare: number;                            // share of rows with outOfTrainingRange.length>0
  modelVersion: string; asOfDate: string;
}
interface Pipeline {   // left→right strip, each stage {status, label, metric, at}
  csv:       { loadLogs: number; lastLoadAt: string | null; rowsRejected: number };            // LoadLog
  broker:    { up: boolean; entities: number; weatherObserved: number };                       // counts
  stream:    { subscriptions: number; lastNotification: string | null; allOk: boolean };       // subscriptions
  inference: { up: boolean; notifications: number; readingsNew: number; lastNotificationAt: string | null; modelVersion: string | null };
  writeback: { enabled: boolean; written: number | null; pending: number; hasError: boolean; yieldPredictions: number };
  ui:        { up: true };
}
```

Region per prediction: take it from the cell (`cells` cache, cellId → region). Fall back to the farm id prefix `F`→FI_SW, `S`→SE_SKANE.

---

## 6. Information architecture

Left sidebar on desktop (collapses to a bottom tab bar under 768 px). There's a global **region switch** (Finland / Sweden / Both). Finland and Sweden are separate operations, so KPIs are always per region and never pooled across them. There's also a data-date chip ("Season 2027 · data as of 27 Oct 2027") and a light/dark toggle.

1. **Overview** `/`
   - Pipeline health strip: `CSV files → Broker → Weather stream → Inference → Write-back → This UI`. Each node shows a status dot, one metric ("41 files", "37,8k entities", "43 pushes · 15:58", "model 5cf88f33", "2,465 written · 0 pending") and links to Data or Services.
   - Headline KPI cards per region: contract area (ha), estimated production (t) vs baseline (t), Δ %, and season completeness ("241 of 241 days observed").
   - A per-crop row of small "estimate vs baseline" bullet bars.
   - "Needs attention": the top 5 farms by area-weighted Δ below baseline, linking to Farm detail.
2. **Live season** `/season`
   - Crop tabs (pea, turnip rape, potato, carrot, spinach), split by region.
   - For each: an estimate-vs-baseline bullet chart, a distribution of parcel Δ% (dot plot or histogram), a completeness bar (observed / filled gap / filled ahead), and the out-of-training-range share with a plain-language caveat.
   - A sortable farm table (farm, parcels, ha, est, base, Δ) that drills into Farm detail.
   - Copy rule (from model-inference README backtests): if the data date is before 15 June, show "Early season: the estimate is not yet better than the farm average".
3. **Map** `/map`
   - Region view with the cell squares underneath (fill = mean Δ of the cell's predictions, or neutral if there are none).
   - Contract parcels with predictions as points coloured by Δ% (diverging scale). Other parcels are small grey points and are off by default. Farm markers are on a toggle.
   - Click opens a side panel (parcel or farm or cell) with links.
   - Leaflet 1.9 is justified here (pan and zoom over 14k points with canvas rendering, plus a basemap for orientation). Use OSM or CARTO light/dark tiles with attribution. If tiles fail to load, the SVG overlay must still be readable on a plain background.
4. **Farm detail** `/farm/:farmId`
   - Header: farm id, region, segment, organic, contract crops, joined year.
   - Per-crop contract facts (area, irrigated, N, yields reported).
   - Parcels table (parcel, planned crop, ha, soil, drainage, prediction est/base/Δ).
   - Mini map. A prediction-history sparkline per parcel (from `/api/live/history`). A link to the cell's weather.
   - "Source" drawer: the normalized entity with `refLoadLog` links.
5. **Weather** `/weather/:cellId?`
   - Cell picker (by region, or click on a small cell map).
   - Daily series for 2027 Mar–Oct: temperature band (min–max plus mean line), daily precipitation bars, cumulative precipitation vs cumulative ET0 (water balance).
   - Monthly climate (temporal API): a 1991–2026 historical line, then 2027–2060 lines per SSP. Toggles for tmean, precip, pet and hot days. Data-coverage note from `/api/live/observations` (stored, observed and filled days, missing days).
6. **Assistant** `/assistant`
   - Native chat (§4.4) with starter prompts, tool-step chips, Markdown answers, Stop and New chat buttons, and a footer "Answers come from the live broker via the FIWARE chat-bot · <model>".
7. **Data & provenance** `/data`
   - LoadLog table (file, schema, rows read, loaded, dropped, rejected, sha256 short, by, when).
   - Entity counts for all 30 types.
   - Subscriptions (with last notification).
   - Inference counters (notifications, new, out-of-season and duplicate readings) and `recent_rejected`.
   - Per-cell observation status table.
   - Plain explanation of the provenance chain: attribute → `refLoadLog` → file + sha256.
8. **Services** `/services`
   - Cards for all §1 services, grouped as Pipeline (broker, context, weather-aggregator, inference, backend), AI (chat-bot, MCP), Tools (C3, Streamlit, legacy frontend) and Platform (Keycloak, APISIX).
   - Each card shows status, latency, detail and an Open link. C3 and Streamlit also get an **Embed** tab (`/services/c3`, `/services/streamlit`) that renders a full-height iframe.
   - Auto-refresh every 10 s while visible.

Use client-side routing with the History API (Bun's `"/*": index` serves the SPA). Poll intervals: services 10 s, predictions and overview 30 s, the rest on navigation. Pause polling while the tab is hidden.

---

## 7. Theme

**No official Apetit brand colours or fonts were found.** The challenge brief PDF uses Since AI's black-and-magenta template (#EF1897), not Apetit's. The data package's START_HERE.html uses muted field greens (`#2f4f1f` headings, `#9bb27a` rules, `#1d2a1d` text, `#eef3e6` and `#f3f5f0` fills). This is therefore a **designed warm Nordic food palette** that takes its anchor green from the package: field green, rapeseed yellow, pea green, berry and oat neutrals. Don't copy any Apetit logo file. The brand is a **text wordmark "Apetit"** (weight 800, tracking -0.02em, colour `--brand`) followed by a small rapeseed-yellow dot and the product name "Field Navigator" in muted text.

### 7.1 Tokens (CSS variables on `:root`, `.dark` overrides; Tailwind v4 `@theme inline` maps them like `../frontend/styles/globals.css`)

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#FAF7F0` oat-50 | `#121510` | page |
| `--surface` | `#FFFFFF` | `#1A1F17` | cards |
| `--surface-2` | `#F3EEE2` oat-100 | `#222820` | wells, table header, sidebar |
| `--border` | `#E4DCC8` oat-200 | `#2F372B` | hairlines |
| `--text` | `#1F2A1C` soil ink | `#ECEADF` | body |
| `--muted` | `#6E6A5C` | `#A39F90` | secondary text (≥4.5:1 on bg) |
| `--brand` | `#2F5D31` field green | `#8CC08A` | wordmark, primary buttons, active nav |
| `--brand-strong` | `#1F4021` | `#B3D9AE` | hover |
| `--brand-soft` | `#E3EEDB` | `#22331F` | selected rows, chips |
| `--rapeseed` | `#E3B21B` | `#F1C84B` | accent, highlights, the wordmark dot (decoration only, not text on light) |
| `--rapeseed-soft` | `#FBF0C6` | `#3A3214` | callouts |
| `--pea` | `#7DB043` | `#98C865` | secondary accent (illustrative only) |
| `--berry` | `#A3324B` lingonberry | `#E58BA0` | errors, destructive |
| `--focus` | `#2F5D31` | `#8CC08A` | 2 px focus ring |

Status (always paired with an icon or text, never colour alone): up `#2E7D4F` / dark `#5FBF85`, degraded `#B7791F` / `#E3B04B`, down `#B3261E` / `#F07A70`, unknown `--muted`.

Data colours (`--viz-*`, fixed per entity, same in every chart):

- Crops: pea `#4E9A3A` / dark `#7CC266`, turnip_rape `#D29E00` / `#E8BE3A`, potato `#7E57A6` / `#B394D8`, carrot `#E07020` / `#F29A55`, spinach `#1E6E73` / `#4FB3B8`.
- **Estimate vs baseline (diverging, colour-blind safe, earthy BrBG):** below `#A6611A` → `#DFC27D` → neutral `#EDE7D9` (dark `#3A3A33`) → `#80CDC1` → above `#01665E`. Domain Δ% clamps at ±25. Estimate line `--brand`, baseline line dashed `--muted`.
- Weather: temperature `#C2552D`, precipitation `#3B7EA1`, ET0 `#D29E00`. Scenarios: historical `#8C8678`, ssp126 `#5B9BC4`, ssp245 `#D9822B`, ssp585 `#9C2F1B`.
- Completeness: observed `--brand`, filled gap `--rapeseed`, filled ahead `--border` (hatched).

### 7.2 Typography

Use the system stacks so the app works offline with no font downloads:

- UI: `ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`
- Numbers: `font-variant-numeric: tabular-nums`
- Wordmark and page titles: `ui-serif, "Iowan Old Style", "Palatino Linotype", Georgia, serif` at weight 700–800, for a warm food-brand feel

Scale: 12, 13 (meta), 14 (body, dense tables), 16 (body), 20, 24 and 32 (KPI numbers, tabular). Line height 1.5 for body. Radius 10 px for cards and 999 px for chips. Soft shadows only in light mode.

### 7.3 Voice and UX

- Plain language for farmers and advisors: "Estimated yield", "Usual yield (farm average)", "Days of weather so far". Use t/ha and ha, with Finnish-friendly number formatting (`toLocaleString('fi-FI')` is optional, en-GB is the default).
- Every number gets its source and date on hover ("YieldPrediction · computed 7 Nov 15:58 · model 5cf88f33").
- Every chart has a "Show as table" toggle (as in `../frontend/src/components/viz/TableToggle.tsx`).
- Charts are hand-written SVG. Reuse the approach in `../frontend/src/components/viz` (scales, Axis, LineChart, Tooltip, useMeasure) but recolour with the tokens above.
- Synthetic-data disclaimer in the footer: "All data is synthetic (Apetit × Since AI 2026 package)".
- Empty, loading and error states for every panel. An upstream outage shows a calm inline banner with the service name and a link to Services.

---

## 8. Things that will bite

1. `YieldPrediction.refParcel` → `AgriParcel` (doesn't exist). Join via the id (§2.7).
2. `Parcel.crop` ≠ prediction crop in 65 % of rows. Use the prediction crop.
3. SE farm survey values are Swedish strings (`"9,59"`, `"nej"`) under the crop key `ärt_frysärt`.
4. `asOfDate` and `computedAt` are `{"@type","@value"}` in broker keyValues. Inference gives plain strings.
5. Inference `/predictions` defaults to `limit=1000`. Pass `limit=100000`.
6. Broker default `limit` is 20. Results aren't sorted.
7. The data's season is **2027** (simulated). `computedAt` is wall-clock 2026. Show both, clearly labelled.
8. Inference `/health` leaks local paths. Strip them (or use the backend).
9. The `Bun.serve` default `idleTimeout` of 10 s kills chat streams. Set it to 255.
10. Chat tool results can be 70 KB each and are re-sent with the history. Truncate them (§4.4).
11. The backend rejects `:3300` CORS and requires a token. Server-side only.
12. Monthly climate values are `{historical}` before 2027 and `{ssp126,ssp245,ssp585}` from 2027.
13. WeatherObserved has no location. Join on `cellId`.

## 9. Samples index (`docs/samples/`)

`broker-types.json`; `broker-{Farm,Parcel,ClimateGridCell,WeatherObserved,YieldPrediction,LoadLog}-{keyValues,normalized}.json` (2 entities each); `broker-Farm-SE-keyValues.json` (Swedish raw values); `broker-temporal-ClimateGridCell-normalized.json` (4 months around the historical→SSP switch); `broker-temporal-ClimateGridCell-temporalValues.json` (2026-01..2027-06, 3 attrs); `broker-subscriptions.json`; `inference-health.json`; `inference-predictions-latest.json` (3 of 2,465); `inference-observations-status.json` (2 of 84 seasons); `backend-live-health.json`; `chatbot-me.json`; `chatbot-providers.json`; `chatbot-chat-events.json` (one real run, tool output trimmed); `chatbot-chat-raw.sse` (the same run as wire format).
