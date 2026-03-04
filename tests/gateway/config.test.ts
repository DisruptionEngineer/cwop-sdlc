import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { loadConfig } from "../../config/cwop-sdlc.config.js";

describe("loadConfig — network/device extensions", () => {
  const savedEnv: Record<string, string | undefined> = {};
  const envKeys = ["CWOP_GATEWAY_HOST", "CWOP_NETWORK_MODE", "CWOP_API_KEY"];

  beforeEach(() => {
    for (const key of envKeys) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of envKeys) {
      if (savedEnv[key] !== undefined) {
        process.env[key] = savedEnv[key];
      } else {
        delete process.env[key];
      }
    }
  });

  it("defaults to local mode with 127.0.0.1", () => {
    const config = loadConfig();
    expect(config.gateway.networkMode).toBe("local");
    expect(config.gateway.host).toBe("127.0.0.1");
    expect(config.gateway.apiKey).toBe("");
  });

  it("switches to device mode and 0.0.0.0 via env", () => {
    process.env.CWOP_NETWORK_MODE = "device";
    const config = loadConfig();
    expect(config.gateway.networkMode).toBe("device");
    expect(config.gateway.host).toBe("0.0.0.0");
  });

  it("respects explicit host override in device mode", () => {
    process.env.CWOP_NETWORK_MODE = "device";
    process.env.CWOP_GATEWAY_HOST = "192.168.1.100";
    const config = loadConfig();
    expect(config.gateway.networkMode).toBe("device");
    expect(config.gateway.host).toBe("192.168.1.100");
  });

  it("sets API key from env", () => {
    process.env.CWOP_API_KEY = "my-secret-key";
    const config = loadConfig();
    expect(config.gateway.apiKey).toBe("my-secret-key");
  });

  it("host override works in local mode too", () => {
    process.env.CWOP_GATEWAY_HOST = "0.0.0.0";
    const config = loadConfig();
    expect(config.gateway.networkMode).toBe("local");
    expect(config.gateway.host).toBe("0.0.0.0");
  });
});
