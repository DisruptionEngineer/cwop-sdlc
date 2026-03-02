/**
 * CWOP Gateway Server
 *
 * Bun HTTP + WebSocket server serving the dashboard UI
 * and providing API endpoints for extensions and LLM interaction.
 *
 * Start: bun run src/gateway/server.ts
 * Dev:   bun --watch run src/gateway/server.ts
 */

import { resolve } from "node:path";
import { loadConfig } from "../../config/cwop-sdlc.config.js";
import { ExtensionRegistry } from "../registry/extension-registry.js";
import { OllamaProvider } from "../llm/ollama.provider.js";
import { CWOPEngine } from "../cwop/engine.js";
import { CODE_BUILDER_PRESET } from "../cwop/presets/code-builder.preset.js";
import { CODE_REVIEW_PRESET } from "../cwop/presets/code-review.preset.js";
import type { WSMessage, ChatSendPayload } from "../types/gateway.js";
import { handleHttpRequest } from "./router.js";
import { handleWebSocket } from "./ws-handler.js";

const UI_ROOT = resolve("src/ui");

const config = loadConfig();
const registry = new ExtensionRegistry();
const ollama = new OllamaProvider(config.ollama.baseUrl);

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

// Track connected WebSocket clients
const wsClients = new Set<{ ws: any; id: string }>();

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

    // Static UI files
    if (url.pathname === "/" || url.pathname === "/index.html") {
      return serveStaticFile("src/ui/dashboard.html", "text/html");
    }
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
    return handleHttpRequest(req, url, { registry, ollama, config });
  },

  websocket: {
    open(ws) {
      const client = { ws, id: (ws.data as { id: string }).id };
      wsClients.add(client);
      console.log(`[ws] Client connected: ${client.id}`);
    },

    message(ws, message) {
      let data: WSMessage;
      try {
        data = JSON.parse(String(message)) as WSMessage;
      } catch {
        ws.send(JSON.stringify({ type: "error", payload: { code: "INVALID_JSON", message: "Malformed message" }, id: crypto.randomUUID(), timestamp: Date.now() }));
        return;
      }
      handleWebSocket(data, ws, { registry, ollama, config, broadcast }).catch(err => {
        console.error("[ws] Handler error:", err);
      });
    },

    close(ws) {
      const id = (ws.data as { id: string }).id;
      for (const client of wsClients) {
        if (client.id === id) {
          wsClients.delete(client);
          break;
        }
      }
      console.log(`[ws] Client disconnected: ${id}`);
    },
  },
});

function broadcast(msg: WSMessage): void {
  const data = JSON.stringify(msg);
  for (const client of wsClients) {
    client.ws.send(data);
  }
}

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

console.log(`
╔═══════════════════════════════════════════════╗
║          CWOP-SDLC Gateway                    ║
║  http://${config.gateway.host}:${config.gateway.port}                ║
║                                               ║
║  Extensions: ${registry.listExtensions().length} registered                    ║
║  Ollama:     ${config.ollama.baseUrl}           ║
╚═══════════════════════════════════════════════╝
`);
