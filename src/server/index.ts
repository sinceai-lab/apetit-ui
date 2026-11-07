// App server: serves the SPA (HTML import) and the /api allowlist on PORT (default 3300).
import { serve } from "bun";
import index from "../web/index.html";
import { config } from "./config";
import { handleApi } from "./routes";

const server = serve({
  port: config.port,
  // Max allowed; the 10 s default cuts silent SSE chat streams during slow tool calls.
  idleTimeout: 255,
  routes: {
    "/api/*": (req, srv) => handleApi(req, srv),
    "/api": (req, srv) => handleApi(req, srv),
    "/*": index,
  },
  development: process.env.NODE_ENV !== "production" && { hmr: true, console: true },
});

console.log(`Apetit UI on ${server.url} (backend token ${config.backendToken ? "set" : "missing: predictions fall back to inference"})`);
