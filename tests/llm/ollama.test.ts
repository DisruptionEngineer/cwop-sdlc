import { describe, it, expect } from "bun:test";
import { OllamaProvider } from "../../src/llm/ollama.provider.js";

describe("OllamaProvider", () => {
  it("initializes with default URL", () => {
    const provider = new OllamaProvider();
    expect(provider.name).toBe("ollama");
    expect(provider.baseUrl).toBe("http://localhost:11434");
  });

  it("initializes with custom URL", () => {
    const provider = new OllamaProvider("http://192.168.1.100:11434");
    expect(provider.baseUrl).toBe("http://192.168.1.100:11434");
  });

  it("health check returns unhealthy when Ollama is not running", async () => {
    const provider = new OllamaProvider("http://localhost:99999");
    const health = await provider.healthCheck();
    expect(health.healthy).toBe(false);
    expect(health.provider).toBe("ollama");
    expect(health.error).toBeDefined();
  });
});
