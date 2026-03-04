/**
 * CWOP Gateway Server
 *
 * Bun HTTP + WebSocket server serving the technician dashboard UI
 * and customer display UI, with API endpoints for extensions and LLM.
 *
 * Modes:
 *   local  — binds to 127.0.0.1, no auth (default, dev)
 *   device — binds to 0.0.0.0, API key auth, serves customer display
 *
 * Start: bun run src/gateway/server.ts
 * Dev:   bun --watch run src/gateway/server.ts
 */

import { resolve } from "node:path";
import { loadConfig } from "../../config/cwop-sdlc.config.js";
import { ExtensionRegistry } from "../registry/extension-registry.js";
import { OllamaProvider } from "../llm/ollama.provider.js";
import { CODE_BUILDER_PRESET } from "../cwop/presets/code-builder.preset.js";
import { CODE_REVIEW_PRESET } from "../cwop/presets/code-review.preset.js";
import type { WSMessage, DeviceType, AuthPayload } from "../types/gateway.js";
import { handleHttpRequest } from "./router.js";
import { handleWebSocket } from "./ws-handler.js";
import { requiresAuth, validateWsAuth } from "./auth.js";
import { OBDBridge } from "../obd/obd-bridge.js";
import { SnapshotStore } from "../obd/snapshot-store.js";

const UI_ROOT = resolve("src/ui");

const config = loadConfig();
const registry = new ExtensionRegistry();
const ollama = new OllamaProvider(config.ollama.baseUrl);
const bridge = new OBDBridge();
const snapshots = new SnapshotStore();
snapshots.init().catch(err => console.warn("[snapshots] Init warning:", err));

// Register default extensions
registry.register({
  id: "code-builder",
  name: "Code Builder",
  description: "C#/SQL/Azure code generation with CWOP context management",
  version: "0.1.0",
  cwopPreset: CODE_BUILDER_PRESET,
  defaultModel: config.ollama.codeModel,
  capabilities: ["code-generation", "chat"],
});

registry.register({
  id: "code-review",
  name: "Code Review",
  description: "PR review assistant with structured checklist evaluation",
  version: "0.1.0",
  cwopPreset: CODE_REVIEW_PRESET,
  defaultModel: config.ollama.reviewModel,
  capabilities: ["code-review", "chat"],
});

// ── Connected client tracking ────────────────────────────

export interface WSClient {
  ws: any;
  id: string;
  deviceType: DeviceType;
  name: string;
  connectedAt: number;
  lastHeartbeat: number;
  authenticated: boolean;
  batteryPct?: number;
}

const wsClients = new Map<string, WSClient>();

// Session-level counters (reset on gateway restart)
let sessionStartTime = Date.now();
let totalToolCount = 0;

export function getSessionInfo() {
  return { sessionStartTime, totalToolCount };
}
export function incrementToolCount() {
  totalToolCount++;
}

// ── HTTP + WebSocket server ──────────────────────────────

const server = Bun.serve({
  port: config.gateway.port,
  hostname: config.gateway.host,

  async fetch(req, server) {
    const url = new URL(req.url);

    // WebSocket upgrade
    if (url.pathname === "/ws") {
      const upgraded = server.upgrade(req, {
        data: { id: crypto.randomUUID() },
      });
      if (upgraded) return undefined;
      return new Response("WebSocket upgrade failed", { status: 400 });
    }

    // ── Technician Dashboard ──
    if (url.pathname === "/" || url.pathname === "/index.html") {
      return serveStaticFile("src/ui/dashboard.html", "text/html");
    }

    // ── Customer Display UI ──
    if (url.pathname === "/customer" || url.pathname === "/customer/") {
      return serveStaticFile("src/ui/customer/index.html", "text/html");
    }
    if (url.pathname.startsWith("/customer/js/")) {
      return serveStaticFile(`src/ui/customer${url.pathname.slice("/customer".length)}`, "application/javascript");
    }
    if (url.pathname.startsWith("/customer/styles/")) {
      return serveStaticFile(`src/ui/customer${url.pathname.slice("/customer".length)}`, "text/css");
    }

    // ── Shared static assets ──
    if (url.pathname.startsWith("/components/")) {
      return serveStaticFile(`src/ui${url.pathname}`, "application/javascript");
    }
    if (url.pathname.startsWith("/styles/")) {
      return serveStaticFile(`src/ui${url.pathname}`, "text/css");
    }
    if (url.pathname.startsWith("/js/")) {
      return serveStaticFile(`src/ui${url.pathname}`, "application/javascript");
    }

    // API routes
    return handleHttpRequest(req, url, { registry, ollama, config, wsClients, getSessionInfo, bridge, snapshots });
  },

  websocket: {
    open(ws) {
      const id = (ws.data as { id: string }).id;
      const client: WSClient = {
        ws,
        id,
        deviceType: "technician",
        name: "unknown",
        connectedAt: Date.now(),
        lastHeartbeat: Date.now(),
        authenticated: !requiresAuth(config),
      };
      wsClients.set(id, client);
      console.log(`[ws] Client connected: ${id} (auth ${client.authenticated ? "ok" : "pending"})`);
    },

    message(ws, message) {
      const id = (ws.data as { id: string }).id;
      const client = wsClients.get(id);
      if (!client) return;

      let data: WSMessage;
      try {
        data = JSON.parse(String(message)) as WSMessage;
      } catch {
        ws.send(JSON.stringify({ type: "error", payload: { code: "INVALID_JSON", message: "Malformed message" }, id: crypto.randomUUID(), timestamp: Date.now() }));
        return;
      }

      // Auth message (must be first in device mode)
      if (data.type === "auth") {
        const payload = data.payload as AuthPayload;
        if (validateWsAuth(payload?.key ?? "", config)) {
          client.authenticated = true;
          ws.send(JSON.stringify({ type: "auth", payload: { success: true }, id: data.id, timestamp: Date.now() }));
        } else {
          ws.send(JSON.stringify({ type: "error", payload: { code: "AUTH_FAILED", message: "Invalid API key" }, id: data.id, timestamp: Date.now() }));
        }
        return;
      }

      // Block unauthenticated clients
      if (!client.authenticated) {
        ws.send(JSON.stringify({ type: "error", payload: { code: "AUTH_REQUIRED", message: "Send auth message first" }, id: data.id, timestamp: Date.now() }));
        return;
      }

      handleWebSocket(data, ws, {
        registry,
        ollama,
        config,
        broadcast,
        broadcastToCustomers,
        client,
        wsClients,
        getSessionInfo,
        bridge,
        snapshots,
      }).catch(err => {
        console.error("[ws] Handler error:", err);
      });
    },

    close(ws) {
      const id = (ws.data as { id: string }).id;
      const client = wsClients.get(id);
      if (client) {
        wsClients.delete(id);
        console.log(`[ws] Client disconnected: ${id} (${client.deviceType}:${client.name})`);
        // Notify remaining clients about the device list change
        broadcastDeviceList();
      }
    },
  },
});

// ── Broadcast helpers ────────────────────────────────────

function broadcast(msg: WSMessage): void {
  const data = JSON.stringify(msg);
  for (const [, client] of wsClients) {
    if (client.authenticated) {
      client.ws.send(data);
    }
  }
}

function broadcastToCustomers(msg: WSMessage): void {
  const data = JSON.stringify(msg);
  for (const [, client] of wsClients) {
    if (client.authenticated && client.deviceType === "customer") {
      client.ws.send(data);
    }
  }
}

// ── Static file serving with path traversal protection ───

async function serveStaticFile(requestedPath: string, contentType: string): Promise<Response> {
  const filePath = resolve(requestedPath);
  if (!filePath.startsWith(UI_ROOT + "/") && filePath !== UI_ROOT) {
    return new Response("Forbidden", { status: 403 });
  }
  try {
    const file = Bun.file(filePath);
    if (await file.exists()) {
      return new Response(file, {
        headers: { "Content-Type": contentType, "Cache-Control": "no-cache" },
      });
    }
    return new Response("Not found", { status: 404 });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

// ── OBD Polling (broadcast live data when connected) ─────

let obdPolling = false;

async function pollOBDData(): Promise<void> {
  if (obdPolling) return;
  obdPolling = true;

  while (true) {
    await new Promise(r => setTimeout(r, 2000));
    try {
      const status = await bridge.status();
      if (!status.connected) continue;

      const snap = await bridge.snapshot();
      const dtcData = await bridge.dtcs();

      const obdMsg: WSMessage = {
        id: crypto.randomUUID(),
        type: "obd.data",
        payload: {
          ...snap,
          dtcDetails: dtcData.dtcs,
        },
        timestamp: Date.now(),
      };
      broadcast(obdMsg);
    } catch {
      // Bridge unreachable — skip this cycle
    }
  }
}

pollOBDData().catch(() => {});

// ── OBD Sim Direct Polling ──────────────────────────────

const SIM_URL = "http://10.10.7.54:8080";
let simConnected = false;
let simPolling = false;

export function isSimConnected() { return simConnected; }

export async function connectSim(): Promise<{ connected: boolean; scenario: string }> {
  try {
    const res = await fetch(`${SIM_URL}/api/status`, { signal: AbortSignal.timeout(3000) });
    const data = await res.json() as { scenario: string; name: string; dtcs: string[] };
    simConnected = true;
    if (!simPolling) pollSimData();
    broadcast({
      id: crypto.randomUUID(),
      type: "obd.status",
      payload: { connected: true, device: "OBD Sim", mac: "10.10.7.54", source: "obdsim" },
      timestamp: Date.now(),
    });
    broadcastDeviceList();
    return { connected: true, scenario: data.name };
  } catch {
    return { connected: false, scenario: "" };
  }
}

export async function disconnectSim(): Promise<void> {
  simConnected = false;
  broadcast({
    id: crypto.randomUUID(),
    type: "obd.status",
    payload: { connected: false, device: "", mac: "", source: "none" },
    timestamp: Date.now(),
  });
  broadcastDeviceList();
}

async function pollSimData(): Promise<void> {
  if (simPolling) return;
  simPolling = true;

  while (true) {
    await new Promise(r => setTimeout(r, 1500));
    if (!simConnected) continue;
    try {
      const res = await fetch(`${SIM_URL}/api/pids`, { signal: AbortSignal.timeout(3000) });
      const data = await res.json() as { pids: Record<string, number>; dtcs: string[]; scenario: string };

      const obdMsg: WSMessage = {
        id: crypto.randomUUID(),
        type: "obd.data",
        payload: {
          timestamp: Date.now(),
          rpm: data.pids["RPM"] ?? 0,
          speed: data.pids["Speed"] ?? 0,
          coolantTemp: data.pids["Coolant Temp"] ?? 0,
          intakeTemp: data.pids["Intake Temp"] ?? 0,
          maf: data.pids["MAF"] ?? 0,
          throttlePos: data.pids["Throttle"] ?? 0,
          engineLoad: data.pids["Engine Load"] ?? 0,
          stftB1: data.pids["STFT B1"] ?? 0,
          ltftB1: data.pids["LTFT B1"] ?? 0,
          stftB2: data.pids["STFT B2"] ?? 0,
          ltftB2: data.pids["LTFT B2"] ?? 0,
          timingAdvance: data.pids["Timing Adv"] ?? 0,
          o2VoltageB1S1: data.pids["O2 B1S1"] ?? 0,
          dtcs: data.dtcs ?? [],
          source: "obdsim",
        },
        timestamp: Date.now(),
      };
      broadcast(obdMsg);
    } catch {
      // Sim unreachable — skip
    }
  }
}

pollSimData().catch(() => {});

// ── Device list broadcast ────────────────────────────────

function broadcastDeviceList(): void {
  const devices = Array.from(wsClients.values())
    .filter(c => c.authenticated)
    .map(c => ({
      id: c.id,
      deviceType: c.deviceType,
      name: c.name,
      connectedAt: c.connectedAt,
    }));
  broadcast({
    id: crypto.randomUUID(),
    type: "devices.list",
    payload: { devices, count: devices.length, simConnected },
    timestamp: Date.now(),
  });
}

// ── Startup banner ───────────────────────────────────────

const modeLabel = config.gateway.networkMode === "device" ? "DEVICE" : "LOCAL";
const authLabel = requiresAuth(config) ? "API key" : "none";

console.log(`
+-----------------------------------------------+
|  Crew Chief Gateway [${modeLabel}]
|  http://${config.gateway.host}:${config.gateway.port}
|
|  Extensions:  ${registry.listExtensions().length} registered
|  Ollama:      ${config.ollama.baseUrl}
|  OBD Bridge:  http://127.0.0.1:8081
|  Snapshots:   /home/pi/crew-chief-data/snapshots
|  Auth:        ${authLabel}
|  Customer UI: /customer
+-----------------------------------------------+
`);
