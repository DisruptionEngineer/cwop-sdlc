import type { ExtensionRegistry } from "../registry/extension-registry.js";
import type { OllamaProvider } from "../llm/ollama.provider.js";
import type { CWOPSdlcConfig } from "../../config/cwop-sdlc.config.js";

const MAX_MESSAGE_LENGTH = 32_000;

interface RouterContext {
  registry: ExtensionRegistry;
  ollama: OllamaProvider;
  config: CWOPSdlcConfig;
}

function getAllowedOrigin(config: CWOPSdlcConfig): string {
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
  const { registry, ollama, config } = ctx;
  const allowedOrigin = getAllowedOrigin(config);

  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": allowedOrigin,
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  // Health check
  if (url.pathname === "/api/health") {
    const health = await ollama.healthCheck();
    return json(health, 200, allowedOrigin);
  }

  // List models
  if (url.pathname === "/api/models") {
    const models = await ollama.listModels();
    return json(models, 200, allowedOrigin);
  }

  // List extensions
  if (url.pathname === "/api/extensions") {
    return json(registry.listExtensions(), 200, allowedOrigin);
  }

  // Extension CWOP status
  const cwopMatch = url.pathname.match(/^\/api\/cwop\/([^/]+)\/status$/);
  if (cwopMatch) {
    const status = registry.getBudgetStatus(cwopMatch[1]);
    if (!status) return json({ error: "Extension not found" }, 404, allowedOrigin);
    return json(status, 200, allowedOrigin);
  }

  // Chat endpoint
  if (url.pathname === "/api/chat" && req.method === "POST") {
    const rawBody = await req.json().catch(() => null);
    const body = validateChatBody(rawBody);
    if (!body) return json({ error: "Invalid request body" }, 400, allowedOrigin);

    const engine = registry.getEngine(body.extensionId);
    if (!engine) return json({ error: "Extension not found" }, 404, allowedOrigin);

    const model = registry.getModel(body.extensionId);
    if (!model) return json({ error: "Extension model not configured" }, 404, allowedOrigin);

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
      }, 200, allowedOrigin);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return json({ error: message }, 502, allowedOrigin);
    }
  }

  // Chat streaming endpoint
  if (url.pathname === "/api/chat/stream" && req.method === "POST") {
    const rawBody = await req.json().catch(() => null);
    const body = validateChatBody(rawBody);
    if (!body) return json({ error: "Invalid request body" }, 400, allowedOrigin);

    const engine = registry.getEngine(body.extensionId);
    if (!engine) return json({ error: "Extension not found" }, 404, allowedOrigin);

    const model = registry.getModel(body.extensionId);
    if (!model) return json({ error: "Extension model not configured" }, 404, allowedOrigin);

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
        "Access-Control-Allow-Origin": allowedOrigin,
      },
    });
  }

  // Config endpoint
  if (url.pathname === "/api/config") {
    return json({
      gateway: config.gateway,
      ollama: { baseUrl: config.ollama.baseUrl, defaultModel: config.ollama.defaultModel },
      techStack: config.techStack,
    }, 200, allowedOrigin);
  }

  return json({ error: "Not found" }, 404, allowedOrigin);
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
