# Apetit Field Navigator (apetit-ui)

One Apetit-themed UI over every service in the sinceai stack: the Coraine broker, live yield inference (through the backend), weather, provenance, a native chat over the FIWARE chat-bot, and C3 and Streamlit embeds.

Stack: Bun + React 19 + TypeScript + Tailwind v4, served by `Bun.serve` with an HTML import. The browser only talks to this server (`/api/*`). The server reads the upstreams and is **read-only** against them. The only POST is the chat pass-through.

## Run

```sh
# one-time: copy the backend token without printing it
grep '^API_TOKEN=' ../backend/.env | sed 's/^API_TOKEN=/BACKEND_TOKEN=/' > .env

bun install
bun dev            # http://localhost:3300 (hot reload)
```

Other scripts: `bun test` (unit tests against `docs/samples`), `bun run typecheck` (`bun check`), `bun run build` (outputs to `dist/`), and `bun start` (production mode).

## Environment (`.env`, gitignored, loaded by Bun)

| Var | Required | Default |
|---|---|---|
| `PORT` | no | `3300` |
| `BACKEND_TOKEN` | recommended | none. Without it, predictions and health come from inference directly (`source: "inference"`) |
| `BROKER_URL` `INFERENCE_URL` `BACKEND_URL` `CHATBOT_URL` | no | `http://localhost:1026`, `http://127.0.0.1:8600`, `http://127.0.0.1:8000`, `http://localhost:3006` |
| `MCP_URL` `C3_URL` `STREAMLIT_URL` `KEYCLOAK_URL` `APISIX_URL` `WEATHER_AGG_URL` `CONTEXT_URL` `LEGACY_URL` | no | `:3003`, `:7900`, `:8501`, `:3005`, `:1030`, `:3200`, `:3004`, `:3000` on localhost |

See `.env.example`. The token is only ever read on the server.

## Services it expects

The app needs these running:

- **Coraine broker** on `:1026`
- **Inference** on `127.0.0.1:8600`
- **Backend** on `127.0.0.1:8000`, used for predictions and health, with inference as the fallback
- **Chat-bot** on `:3006`, for the Assistant page

These are optional and only appear on the Services page:

- MCP on `:3003`
- C3 on `:7900` and Streamlit on `:8501` (both embedded)
- Keycloak on `:3005`
- APISIX on `:1030`
- Weather aggregator on `:3200`
- Context on `:3004`
- The legacy frontend on `:3000`

If an upstream is down, its panels show a calm error state, and the API answers `503 {error, upstream}`. If the upstream answers with an error, the API answers `502`.

## Docs

- `docs/CONTRACT.md`: upstream shapes, API routes, information architecture and theme. This is the source of truth.
- `docs/BUILDING.md`: shared modules and how to add a page.
- `docs/samples/`: real trimmed upstream responses, used only by tests.
- `docs/screenshots/`: headless-Chromium captures of every page (1280 px light, 390 px phone, some dark).

The map basemap uses Esri's keyless grey canvas tiles, loaded from the internet. If they can't load, the map still shows its data.
