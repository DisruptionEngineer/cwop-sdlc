import type { ExtensionRegistry } from "../registry/extension-registry.js";
import type { OllamaProvider } from "../llm/ollama.provider.js";
import type { CWOPSdlcConfig } from "../../config/cwop-sdlc.config.js";
import type { WSClient } from "./server.js";
import type { OBDBridge } from "../obd/obd-bridge.js";
import type { SnapshotStore } from "../obd/snapshot-store.js";
import { validateHttpAuth, unauthorizedResponse } from "./auth.js";

const MAX_MESSAGE_LENGTH = 32_000;

interface RouterContext {
  registry: ExtensionRegistry;
  ollama: OllamaProvider;
  config: CWOPSdlcConfig;
  wsClients: Map<string, WSClient>;
  getSessionInfo: () => { sessionStartTime: number; totalToolCount: number };
  bridge: OBDBridge;
  snapshots: SnapshotStore;
}

function corsOrigin(config: CWOPSdlcConfig, req: Request): string {
  if (config.gateway.networkMode === "device") {
    return req.headers.get("Origin") ?? "*";
  }
  return `http://${config.gateway.host}:${config.gateway.port}`;
}

function validateChatBody(body: unknown): { extensionId: string; message: string } | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (typeof b.extensionId !== "string" || typeof b.message !== "string") return null;
  if (b.message.length > MAX_MESSAGE_LENGTH) return null;
  return { extensionId: b.extensionId, message: b.message };
}

export async function handleHttpRequest(
  req: Request,
  url: URL,
  ctx: RouterContext,
): Promise<Response> {
  const { registry, ollama, config, wsClients, getSessionInfo, bridge, snapshots } = ctx;
  const origin = corsOrigin(config, req);

  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-CWOP-Key",
      },
    });
  }

  // Auth check for API routes
  if (url.pathname.startsWith("/api/")) {
    if (!validateHttpAuth(req, url, config)) {
      return unauthorizedResponse();
    }
  }

  // ── Health check ──
  if (url.pathname === "/api/health") {
    const health = await ollama.healthCheck();
    return json(health, 200, origin);
  }

  // ── List models ──
  if (url.pathname === "/api/models") {
    const models = await ollama.listModels();
    return json(models, 200, origin);
  }

  // ── List extensions ──
  if (url.pathname === "/api/extensions") {
    return json(registry.listExtensions(), 200, origin);
  }

  // ── Extension CWOP status ──
  const cwopMatch = url.pathname.match(/^\/api\/cwop\/([^/]+)\/status$/);
  if (cwopMatch) {
    const status = registry.getBudgetStatus(cwopMatch[1]);
    if (!status) return json({ error: "Extension not found" }, 404, origin);
    return json(status, 200, origin);
  }

  // ── Connected devices ──
  if (url.pathname === "/api/devices") {
    const devices = Array.from(wsClients.values()).map(c => ({
      id: c.id,
      deviceType: c.deviceType,
      name: c.name,
      connectedAt: c.connectedAt,
      lastHeartbeat: c.lastHeartbeat,
      batteryPct: c.batteryPct,
    }));
    return json({ devices, count: devices.length }, 200, origin);
  }

  // ── Customer status (aggregated view for customer display) ──
  if (url.pathname === "/api/customer/status") {
    const sessionInfo = getSessionInfo();
    const extensions = registry.listExtensions().map((ext: any) => {
      const budget = registry.getBudgetStatus(ext.id);
      return {
        id: ext.id,
        name: ext.name,
        budgetPct: budget?.utilizationPct ?? 0,
        used: budget?.used ?? 0,
        total: budget?.totalBudget ?? 0,
        active: (budget?.used ?? 0) > 0,
      };
    });

    return json({
      extensions,
      sessionActive: true,
      toolCount: sessionInfo.totalToolCount,
      sessionDurationMs: Date.now() - sessionInfo.sessionStartTime,
      connectedDevices: Array.from(wsClients.values()).filter(c => c.authenticated).length,
    }, 200, origin);
  }

  // ── OBD Bridge Proxy ──
  if (url.pathname === "/api/obd/snapshot") {
    try {
      const snap = await bridge.snapshot();
      return json(snap, 200, origin);
    } catch (err) {
      return json({ error: err instanceof Error ? err.message : "OBD bridge unavailable" }, 503, origin);
    }
  }

  if (url.pathname === "/api/bt/status") {
    try {
      const status = await bridge.status();
      return json(status, 200, origin);
    } catch {
      return json({ connected: false, device: "", mac: "", source: "none" }, 200, origin);
    }
  }

  // ── Sim scenario proxy ──
  if (url.pathname === "/api/sim/scenarios") {
    try {
      const res = await fetch("http://10.10.7.54:8080/api/scenarios", { signal: AbortSignal.timeout(3000) });
      const data = await res.json();
      return json(data, 200, origin);
    } catch {
      return json({ scenarios: [], count: 0, error: "Sim unreachable" }, 503, origin);
    }
  }

  if (url.pathname.match(/^\/api\/sim\/scenario\/[\w-]+$/) && req.method === "POST") {
    const scenario = url.pathname.split("/").pop()!;
    try {
      await fetch(`http://10.10.7.54:8080/scenario/${scenario}`, { signal: AbortSignal.timeout(3000) });
      const res = await fetch("http://10.10.7.54:8080/api/scenarios", { signal: AbortSignal.timeout(3000) });
      const data = await res.json();
      return json(data, 200, origin);
    } catch {
      return json({ error: "Sim unreachable" }, 503, origin);
    }
  }

  // ── Snapshot endpoints ──
  if (url.pathname === "/api/snapshots" && req.method === "GET") {
    const inputMethod = url.searchParams.get("inputMethod") as "obd" | "manual" | null;
    const mode = url.searchParams.get("mode") as string | null;
    const vehicleLabel = url.searchParams.get("vehicleLabel");
    const list = await snapshots.list({
      inputMethod: inputMethod ?? undefined,
      mode: mode as any,
      vehicleLabel: vehicleLabel ?? undefined,
    });
    return json({ snapshots: list, count: list.length }, 200, origin);
  }

  const snapMatch = url.pathname.match(/^\/api\/snapshots\/([a-f0-9-]+)$/);
  if (snapMatch && req.method === "GET") {
    const snap = await snapshots.get(snapMatch[1]);
    if (!snap) return json({ error: "Snapshot not found" }, 404, origin);
    return json(snap, 200, origin);
  }

  if (url.pathname === "/api/snapshots/compare" && req.method === "GET") {
    const beforeId = url.searchParams.get("before");
    const afterId = url.searchParams.get("after");
    if (!beforeId || !afterId) return json({ error: "before and after query params required" }, 400, origin);
    const comparison = await snapshots.compare(beforeId, afterId);
    if (!comparison) return json({ error: "Snapshots not found or incompatible types" }, 404, origin);
    return json(comparison, 200, origin);
  }

  // ── Chat endpoint ──
  if (url.pathname === "/api/chat" && req.method === "POST") {
    const rawBody = await req.json().catch(() => null);
    const body = validateChatBody(rawBody);
    if (!body) return json({ error: "Invalid request body" }, 400, origin);

    const engine = registry.getEngine(body.extensionId);
    if (!engine) return json({ error: "Extension not found" }, 404, origin);

    const model = registry.getModel(body.extensionId);
    if (!model) return json({ error: "Extension model not configured" }, 404, origin);

    engine.updateSlot("target_spec", body.message);
    const context = engine.assembleContext();

    try {
      const response = await ollama.complete({
        model,
        messages: [
          { role: "system", content: context },
          { role: "user", content: body.message },
        ],
        temperature: 0.2,
      });

      registry.updateActivity(body.extensionId);

      return json({
        content: response.content,
        model: response.model,
        tokensUsed: response.tokensUsed,
        durationMs: response.durationMs,
        cwopStatus: registry.getBudgetStatus(body.extensionId),
      }, 200, origin);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return json({ error: message }, 502, origin);
    }
  }

  // ── Chat streaming endpoint ──
  if (url.pathname === "/api/chat/stream" && req.method === "POST") {
    const rawBody = await req.json().catch(() => null);
    const body = validateChatBody(rawBody);
    if (!body) return json({ error: "Invalid request body" }, 400, origin);

    const engine = registry.getEngine(body.extensionId);
    if (!engine) return json({ error: "Extension not found" }, 404, origin);

    const model = registry.getModel(body.extensionId);
    if (!model) return json({ error: "Extension model not configured" }, 404, origin);

    engine.updateSlot("target_spec", body.message);
    const context = engine.assembleContext();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          await ollama.stream(
            {
              model,
              messages: [
                { role: "system", content: context },
                { role: "user", content: body.message },
              ],
              temperature: 0.2,
            },
            (chunk) => {
              controller.enqueue(`data: ${JSON.stringify(chunk)}\n\n`);
            },
          );
          controller.close();
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          controller.enqueue(`data: ${JSON.stringify({ error: message })}\n\n`);
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": origin,
      },
    });
  }

  // ── Config endpoint ──
  if (url.pathname === "/api/config") {
    return json({
      gateway: { port: config.gateway.port, host: config.gateway.host, networkMode: config.gateway.networkMode },
      ollama: { baseUrl: config.ollama.baseUrl, defaultModel: config.ollama.defaultModel },
      techStack: config.techStack,
    }, 200, origin);
  }

  return json({ error: "Not found" }, 404, origin);
}

function json(data: unknown, status = 200, allowedOrigin = "*"): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": allowedOrigin,
    },
  });
}
