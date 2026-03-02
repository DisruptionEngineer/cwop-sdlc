import type { ILLMProvider, LLMRequest, LLMResponse, LLMStreamChunk, ModelInfo, HealthStatus } from "../types/llm.js";

interface OllamaResponse {
  model: string;
  message: { role: string; content: string };
  done: boolean;
  prompt_eval_count?: number;
  eval_count?: number;
}

interface OllamaStreamChunk {
  model: string;
  message: { role: string; content: string };
  done: boolean;
  prompt_eval_count?: number;
  eval_count?: number;
}

interface OllamaModelTag {
  name: string;
  size: number;
  digest: string;
  modified_at: string;
  details?: { parameter_size?: string; quantization_level?: string };
}

const CONTEXT_WINDOWS: Record<string, number> = {
  "qwen2.5-coder": 32768,
  "deepseek-coder": 65536,
  "codellama": 16384,
  "llama3": 8192,
  "mistral": 32768,
  "phi": 16384,
};

export class OllamaProvider implements ILLMProvider {
  readonly name = "ollama";
  readonly baseUrl: string;

  constructor(baseUrl = "http://localhost:11434") {
    this.baseUrl = baseUrl;
  }

  async complete(req: LLMRequest): Promise<LLMResponse> {
    const start = Date.now();
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: req.model,
        messages: req.messages,
        stream: false,
        options: {
          temperature: req.temperature ?? 0.2,
          num_predict: req.maxTokens ?? -1,
        },
      }),
    });

    if (!res.ok) {
      throw new Error(`Ollama error ${res.status}: ${await res.text()}`);
    }

    const data = (await res.json()) as OllamaResponse;
    return {
      content: data.message.content,
      model: data.model,
      tokensUsed: {
        prompt: data.prompt_eval_count ?? 0,
        completion: data.eval_count ?? 0,
        total: (data.prompt_eval_count ?? 0) + (data.eval_count ?? 0),
      },
      durationMs: Date.now() - start,
      provider: this.name,
    };
  }

  async stream(req: LLMRequest, onChunk: (c: LLMStreamChunk) => void): Promise<LLMResponse> {
    const start = Date.now();
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: req.model,
        messages: req.messages,
        stream: true,
        options: { temperature: req.temperature ?? 0.2 },
      }),
    });

    if (!res.ok || !res.body) {
      throw new Error(`Ollama stream error ${res.status}`);
    }

    let fullContent = "";
    let lastChunk: OllamaStreamChunk | null = null;
    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const lines = decoder.decode(value).split("\n").filter(Boolean);
      for (const line of lines) {
        let chunk: OllamaStreamChunk;
        try {
          chunk = JSON.parse(line) as OllamaStreamChunk;
        } catch {
          continue;
        }
        lastChunk = chunk;
        if (!chunk.done) {
          fullContent += chunk.message.content;
          onChunk({ delta: chunk.message.content, done: false, model: chunk.model });
        }
      }
    }

    onChunk({ delta: "", done: true, model: req.model });

    return {
      content: fullContent,
      model: req.model,
      tokensUsed: {
        prompt: lastChunk?.prompt_eval_count ?? 0,
        completion: lastChunk?.eval_count ?? 0,
        total: (lastChunk?.prompt_eval_count ?? 0) + (lastChunk?.eval_count ?? 0),
      },
      durationMs: Date.now() - start,
      provider: this.name,
    };
  }

  async listModels(): Promise<ModelInfo[]> {
    const res = await fetch(`${this.baseUrl}/api/tags`);
    if (!res.ok) return [];
    const data = (await res.json()) as { models: OllamaModelTag[] };
    return data.models.map(m => ({
      id: m.name,
      name: m.name,
      provider: this.name,
      contextWindow: this.inferContextWindow(m.name),
      parameterCount: m.details?.parameter_size,
      quantization: m.details?.quantization_level,
      sizeGb: Math.round((m.size / 1e9) * 10) / 10,
      available: true,
    }));
  }

  async healthCheck(): Promise<HealthStatus> {
    const start = Date.now();
    try {
      const models = await this.listModels();
      return {
        provider: this.name,
        healthy: true,
        latencyMs: Date.now() - start,
        models,
        checkedAt: Date.now(),
      };
    } catch (err) {
      return {
        provider: this.name,
        healthy: false,
        error: err instanceof Error ? err.message : String(err),
        models: [],
        checkedAt: Date.now(),
      };
    }
  }

  async pullModel(modelId: string, onProgress?: (pct: number) => void): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/pull`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: modelId, stream: true }),
    });
    if (!res.ok || !res.body) throw new Error(`Pull failed: ${res.status}`);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const lines = decoder.decode(value).split("\n").filter(Boolean);
      for (const line of lines) {
        let data: { status: string; total?: number; completed?: number };
        try {
          data = JSON.parse(line);
        } catch {
          continue;
        }
        if (data.total && data.completed && onProgress) {
          onProgress(Math.round((data.completed / data.total) * 100));
        }
      }
    }
  }

  private inferContextWindow(modelName: string): number {
    for (const [key, ctx] of Object.entries(CONTEXT_WINDOWS)) {
      if (modelName.includes(key)) return ctx;
    }
    return 4096;
  }
}
