/**
 * Simple API key authentication for device mode.
 *
 * When networkMode === "device" and an apiKey is configured, all
 * HTTP and WebSocket requests must provide the key.
 *
 * HTTP:  X-CWOP-Key header  OR  ?key= query parameter (for kiosk browsers)
 * WS:   First message must be { type: "auth", payload: { key: "..." } }
 *
 * Skipped entirely when networkMode === "local" or apiKey === "".
 */

import type { CWOPSdlcConfig } from "../../config/cwop-sdlc.config.js";

export function requiresAuth(config: CWOPSdlcConfig): boolean {
  return config.gateway.networkMode === "device" && config.gateway.apiKey.length > 0;
}

/**
 * Validate an HTTP request's API key.
 * Returns true if the request is authorized (or auth is disabled).
 */
export function validateHttpAuth(req: Request, url: URL, config: CWOPSdlcConfig): boolean {
  if (!requiresAuth(config)) return true;

  const headerKey = req.headers.get("X-CWOP-Key");
  if (headerKey === config.gateway.apiKey) return true;

  const queryKey = url.searchParams.get("key");
  if (queryKey === config.gateway.apiKey) return true;

  return false;
}

/**
 * Validate a WebSocket auth payload.
 */
export function validateWsAuth(key: string, config: CWOPSdlcConfig): boolean {
  if (!requiresAuth(config)) return true;
  return key === config.gateway.apiKey;
}

/**
 * Create a 401 JSON response for unauthorized requests.
 */
export function unauthorizedResponse(): Response {
  return new Response(JSON.stringify({ error: "Unauthorized", code: "AUTH_REQUIRED" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}
