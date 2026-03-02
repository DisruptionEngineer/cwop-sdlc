import type { ILLMProvider } from "../types/llm.js";
import { OllamaProvider } from "./ollama.provider.js";

const providers = new Map<string, ILLMProvider>();

export function registerProvider(provider: ILLMProvider): void {
  providers.set(provider.name, provider);
}

export function getProvider(name: string): ILLMProvider {
  const provider = providers.get(name);
  if (!provider) {
    throw new Error(`LLM provider "${name}" not registered. Available: ${[...providers.keys()].join(", ")}`);
  }
  return provider;
}

export function listProviders(): string[] {
  return [...providers.keys()];
}

export function initDefaultProviders(ollamaUrl?: string): void {
  registerProvider(new OllamaProvider(ollamaUrl));
}
