// Upstream locations (env overrides) and the service catalogue polled by /api/services.
import type { ServiceGroup } from "../shared/types";

const env = (k: string, d: string) => (process.env[k] || d).replace(/\/+$/, "");

export const config = {
  port: Number(process.env.PORT || 3300),
  brokerUrl: env("BROKER_URL", "http://localhost:1026"),
  inferenceUrl: env("INFERENCE_URL", "http://127.0.0.1:8600"),
  backendUrl: env("BACKEND_URL", "http://127.0.0.1:8000"),
  chatbotUrl: env("CHATBOT_URL", "http://localhost:3006"),
  mcpUrl: env("MCP_URL", "http://localhost:3003"),
  c3Url: env("C3_URL", "http://localhost:7900"),
  streamlitUrl: env("STREAMLIT_URL", "http://localhost:8501"),
  keycloakUrl: env("KEYCLOAK_URL", "http://localhost:3005"),
  apisixUrl: env("APISIX_URL", "http://localhost:1030"),
  weatherAggUrl: env("WEATHER_AGG_URL", "http://localhost:3200"),
  contextUrl: env("CONTEXT_URL", "http://localhost:3004"),
  legacyUrl: env("LEGACY_URL", "http://localhost:3000"),
  /** Server-only. Never sent to the browser. */
  get backendToken(): string | null {
    return process.env.BACKEND_TOKEN?.trim() || null;
  },
};

export const ngsi = (path: string) => `${config.brokerUrl}/ngsi-ld/v1${path}`;

export interface ServiceDef {
  id: string;
  name: string;
  group: ServiceGroup;
  healthUrl: string;
  fallbackUrl?: string;
  openUrl: string | null;
  embedUrl: string | null;
}

export function serviceDefs(): ServiceDef[] {
  const c = config;
  return [
    { id: "broker", name: "Coraine NGSI-LD broker", group: "pipeline", healthUrl: `${c.brokerUrl}/version`, openUrl: null, embedUrl: null },
    { id: "context", name: "JSON-LD @context", group: "pipeline", healthUrl: `${c.contextUrl}/user-context.jsonld`, openUrl: `${c.contextUrl}/user-context.jsonld`, embedUrl: null },
    { id: "weather", name: "Weather aggregator", group: "pipeline", healthUrl: `${c.weatherAggUrl}/health`, openUrl: null, embedUrl: null },
    { id: "inference", name: "Yield inference", group: "pipeline", healthUrl: `${c.inferenceUrl}/health`, openUrl: `${c.inferenceUrl}/docs`, embedUrl: null },
    { id: "backend", name: "sinceai backend", group: "pipeline", healthUrl: `${c.backendUrl}/health`, openUrl: null, embedUrl: null },
    { id: "chatbot", name: "FIWARE chat-bot", group: "ai", healthUrl: `${c.chatbotUrl}/api/me`, openUrl: c.chatbotUrl, embedUrl: null },
    { id: "mcp", name: "FIWARE MCP server", group: "ai", healthUrl: `${c.mcpUrl}/health`, openUrl: null, embedUrl: null },
    { id: "c3", name: "c³ Control Center", group: "tools", healthUrl: `${c.c3Url}/`, openUrl: `${c.c3Url}/`, embedUrl: `${c.c3Url}/` },
    { id: "streamlit", name: "Yield model viewer (Streamlit)", group: "tools", healthUrl: `${c.streamlitUrl}/_stcore/health`, openUrl: `${c.streamlitUrl}/`, embedUrl: `${c.streamlitUrl}/?embed=true` },
    { id: "legacy", name: "Legacy frontend", group: "tools", healthUrl: `${c.legacyUrl}/`, openUrl: `${c.legacyUrl}/`, embedUrl: null },
    { id: "keycloak", name: "Keycloak", group: "platform", healthUrl: `${c.keycloakUrl}/health/ready`, fallbackUrl: `${c.keycloakUrl}/realms/farm-management`, openUrl: `${c.keycloakUrl}/admin/`, embedUrl: null },
    { id: "apisix", name: "APISIX gateway", group: "platform", healthUrl: `${c.apisixUrl}/health`, openUrl: null, embedUrl: null },
  ];
}
