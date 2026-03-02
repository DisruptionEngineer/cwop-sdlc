export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMRequest {
  messages: LLMMessage[];
  model: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

export interface LLMResponse {
  content: string;
  model: string;
  tokensUsed: { prompt: number; completion: number; total: number };
  durationMs: number;
  provider: string;
}

export interface LLMStreamChunk {
  delta: string;
  done: boolean;
  model: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  contextWindow: number;
  parameterCount?: string;
  quantization?: string;
  sizeGb?: number;
  available: boolean;
}

export interface HealthStatus {
  provider: string;
  healthy: boolean;
  latencyMs?: number;
  error?: string;
  models: ModelInfo[];
  checkedAt: number;
}

export interface ILLMProvider {
  readonly name: string;
  readonly baseUrl: string;
  complete(req: LLMRequest): Promise<LLMResponse>;
  stream(req: LLMRequest, onChunk: (chunk: LLMStreamChunk) => void): Promise<LLMResponse>;
  listModels(): Promise<ModelInfo[]>;
  healthCheck(): Promise<HealthStatus>;
  pullModel(modelId: string, onProgress?: (pct: number) => void): Promise<void>;
}
