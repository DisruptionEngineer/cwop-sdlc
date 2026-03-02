import type { BudgetStatus } from "../../src/types/cwop.js";
import type { HealthStatus, ModelInfo } from "../../src/types/llm.js";

const GATEWAY_URL = process.env.CWOP_GATEWAY_URL ?? "http://127.0.0.1:18790";

export async function fetchBudgetStatus(extensionId: string): Promise<BudgetStatus | null> {
  try {
    const res = await fetch(`${GATEWAY_URL}/api/cwop/${extensionId}/status`);
    if (!res.ok) return null;
    return (await res.json()) as BudgetStatus;
  } catch {
    return null;
  }
}

export async function fetchHealthStatus(): Promise<HealthStatus | null> {
  try {
    const res = await fetch(`${GATEWAY_URL}/api/health`);
    if (!res.ok) return null;
    return (await res.json()) as HealthStatus;
  } catch {
    return null;
  }
}

export async function fetchModels(): Promise<ModelInfo[]> {
  try {
    const res = await fetch(`${GATEWAY_URL}/api/models`);
    if (!res.ok) return [];
    return (await res.json()) as ModelInfo[];
  } catch {
    return [];
  }
}

export async function sendChatMessage(extensionId: string, message: string): Promise<string> {
  const res = await fetch(`${GATEWAY_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ extensionId, message }),
  });
  if (!res.ok) throw new Error(`Gateway error: ${res.status}`);
  const data = (await res.json()) as { content: string };
  return data.content;
}
