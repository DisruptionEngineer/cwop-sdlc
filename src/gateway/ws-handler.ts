import type { WSMessage, WSMessageType } from "../types/gateway.js";
import type { ExtensionRegistry } from "../registry/extension-registry.js";
import type { OllamaProvider } from "../llm/ollama.provider.js";
import type { CWOPSdlcConfig } from "../../config/cwop-sdlc.config.js";

interface WSContext {
  registry: ExtensionRegistry;
  ollama: OllamaProvider;
  config: CWOPSdlcConfig;
  broadcast: (msg: WSMessage) => void;
}

export async function handleWebSocket(
  msg: WSMessage,
  ws: { send: (data: string) => void },
  ctx: WSContext,
): Promise<void> {
  const { registry, ollama, broadcast } = ctx;

  switch (msg.type) {
    case "ping":
      ws.send(JSON.stringify(makeMsg("pong", {})));
      break;

    case "extension.list":
      ws.send(JSON.stringify(makeMsg("extension.list", registry.listExtensions())));
      break;

    case "cwop.status": {
      const payload = msg.payload as { extensionId: string };
      const status = registry.getBudgetStatus(payload.extensionId);
      ws.send(JSON.stringify(makeMsg("cwop.update", { extensionId: payload.extensionId, status })));
      break;
    }

    case "model.list": {
      const models = await ollama.listModels();
      ws.send(JSON.stringify(makeMsg("model.list", { models })));
      break;
    }

    case "model.health": {
      const health = await ollama.healthCheck();
      ws.send(JSON.stringify(makeMsg("model.health", health)));
      break;
    }

    case "chat.send": {
      const chatPayload = msg.payload as { extensionId: string; message: string };
      const engine = registry.getEngine(chatPayload.extensionId);
      if (!engine) {
        ws.send(JSON.stringify(makeMsg("error", { code: "EXT_NOT_FOUND", message: "Extension not found" })));
        return;
      }

      engine.updateSlot("target_spec", chatPayload.message);
      const context = engine.assembleContext();
      const model = registry.getModel(chatPayload.extensionId);

      try {
        await ollama.stream(
          {
            model,
            messages: [
              { role: "system", content: context },
              { role: "user", content: chatPayload.message },
            ],
            temperature: 0.2,
          },
          (chunk) => {
            ws.send(JSON.stringify(makeMsg("chat.stream_chunk", {
              requestId: msg.id,
              extensionId: chatPayload.extensionId,
              delta: chunk.delta,
              done: chunk.done,
            })));
          },
        );

        ws.send(JSON.stringify(makeMsg("chat.done", {
          requestId: msg.id,
          extensionId: chatPayload.extensionId,
          cwopStatus: registry.getBudgetStatus(chatPayload.extensionId),
        })));
      } catch (err) {
        ws.send(JSON.stringify(makeMsg("error", {
          code: "LLM_ERROR",
          message: err instanceof Error ? err.message : String(err),
          requestId: msg.id,
        })));
      }
      break;
    }

    default:
      ws.send(JSON.stringify(makeMsg("error", { code: "UNKNOWN_TYPE", message: `Unknown message type: ${msg.type}` })));
  }
}

function makeMsg(type: WSMessageType, payload: unknown): WSMessage {
  return {
    id: crypto.randomUUID(),
    type,
    payload,
    timestamp: Date.now(),
  };
}
