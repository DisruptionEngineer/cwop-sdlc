import { describe, it, expect } from "bun:test";
import { requiresAuth, validateHttpAuth, validateWsAuth, unauthorizedResponse } from "../../src/gateway/auth.js";
import type { CWOPSdlcConfig } from "../../config/cwop-sdlc.config.js";

function makeConfig(overrides: Partial<CWOPSdlcConfig["gateway"]> = {}): CWOPSdlcConfig {
  return {
    gateway: { port: 18790, host: "127.0.0.1", networkMode: "local", apiKey: "", ...overrides },
    ollama: { baseUrl: "http://localhost:11434", defaultModel: "test", codeModel: "test", reviewModel: "test" },
    cwop: { defaultBudget: 6000, overflowStrategy: "drop-low-priority" },
    techStack: { primary: [], secondary: [] },
  };
}

describe("requiresAuth", () => {
  it("returns false in local mode", () => {
    expect(requiresAuth(makeConfig())).toBe(false);
  });

  it("returns false in device mode with empty key", () => {
    expect(requiresAuth(makeConfig({ networkMode: "device", apiKey: "" }))).toBe(false);
  });

  it("returns true in device mode with key", () => {
    expect(requiresAuth(makeConfig({ networkMode: "device", apiKey: "secret123" }))).toBe(true);
  });
});

describe("validateHttpAuth", () => {
  it("allows all requests when auth is disabled", () => {
    const config = makeConfig();
    const req = new Request("http://localhost:18790/api/health");
    const url = new URL(req.url);
    expect(validateHttpAuth(req, url, config)).toBe(true);
  });

  it("accepts valid X-CWOP-Key header", () => {
    const config = makeConfig({ networkMode: "device", apiKey: "abc123" });
    const req = new Request("http://localhost:18790/api/health", {
      headers: { "X-CWOP-Key": "abc123" },
    });
    const url = new URL(req.url);
    expect(validateHttpAuth(req, url, config)).toBe(true);
  });

  it("accepts valid query param key", () => {
    const config = makeConfig({ networkMode: "device", apiKey: "abc123" });
    const req = new Request("http://localhost:18790/customer?key=abc123");
    const url = new URL(req.url);
    expect(validateHttpAuth(req, url, config)).toBe(true);
  });

  it("rejects missing key in device mode", () => {
    const config = makeConfig({ networkMode: "device", apiKey: "abc123" });
    const req = new Request("http://localhost:18790/api/health");
    const url = new URL(req.url);
    expect(validateHttpAuth(req, url, config)).toBe(false);
  });

  it("rejects wrong key", () => {
    const config = makeConfig({ networkMode: "device", apiKey: "abc123" });
    const req = new Request("http://localhost:18790/api/health", {
      headers: { "X-CWOP-Key": "wrong" },
    });
    const url = new URL(req.url);
    expect(validateHttpAuth(req, url, config)).toBe(false);
  });
});

describe("validateWsAuth", () => {
  it("allows any key when auth is disabled", () => {
    const config = makeConfig();
    expect(validateWsAuth("", config)).toBe(true);
    expect(validateWsAuth("anything", config)).toBe(true);
  });

  it("accepts correct key in device mode", () => {
    const config = makeConfig({ networkMode: "device", apiKey: "secret" });
    expect(validateWsAuth("secret", config)).toBe(true);
  });

  it("rejects wrong key in device mode", () => {
    const config = makeConfig({ networkMode: "device", apiKey: "secret" });
    expect(validateWsAuth("wrong", config)).toBe(false);
    expect(validateWsAuth("", config)).toBe(false);
  });
});

describe("unauthorizedResponse", () => {
  it("returns 401 with JSON body", async () => {
    const res = unauthorizedResponse();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
    expect(body.code).toBe("AUTH_REQUIRED");
  });
});
