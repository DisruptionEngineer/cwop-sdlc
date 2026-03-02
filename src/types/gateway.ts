import type { BudgetStatus } from "./cwop.js";

export type WSMessageType =
  | "ping" | "pong"
  | "chat.send" | "chat.response" | "chat.stream_chunk" | "chat.done"
  | "cwop.status" | "cwop.update"
  | "extension.list" | "extension.status"
  | "model.list" | "model.select" | "model.health"
  | "session.start" | "session.end"
  | "error";

export interface WSMessage<T = unknown> {
  id: string;
  type: WSMessageType;
  payload: T;
  timestamp: number;
}

export interface ChatSendPayload {
  extensionId: string;
  message: string;
  sessionId: string;
}

export interface ChatResponsePayload {
  requestId: string;
  extensionId: string;
  content: string;
  cwopStatus: BudgetStatus;
  durationMs: number;
}

export interface ChatStreamChunkPayload {
  requestId: string;
  extensionId: string;
  delta: string;
  done: boolean;
}

export interface CWOPStatusPayload {
  extensionId: string;
  status: BudgetStatus;
}

export interface ExtensionStatusPayload {
  id: string;
  name: string;
  description: string;
  active: boolean;
  model: string;
  cwopPreset: string;
}

export interface ModelListPayload {
  models: Array<{
    id: string;
    name: string;
    sizeGb: number;
    available: boolean;
  }>;
}

export interface ErrorPayload {
  code: string;
  message: string;
  requestId?: string;
}
