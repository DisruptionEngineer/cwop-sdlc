import type { BudgetStatus } from "./cwop.js";

export type WSMessageType =
  | "ping" | "pong"
  | "auth"
  | "chat.send" | "chat.response" | "chat.stream_chunk" | "chat.done"
  | "cwop.status" | "cwop.update"
  | "extension.list" | "extension.status"
  | "model.list" | "model.select" | "model.health"
  | "session.start" | "session.end"
  | "device.register" | "device.heartbeat"
  | "customer.status"
  | "obd.scan" | "obd.connect" | "obd.disconnect" | "obd.data" | "obd.status"
  | "snapshot.record" | "snapshot.list" | "snapshot.compare" | "snapshot.saved"
  | "mode.change"
  | "sim.scenarios" | "sim.select" | "sim.connect" | "sim.disconnect"
  | "devices.list"
  | "error";

export interface WSMessage<T = unknown> {
  id: string;
  type: WSMessageType;
  payload: T;
  timestamp: number;
}

// ── Auth ─────────────────────────────────────────────────

export interface AuthPayload {
  key: string;
}

// ── Chat ─────────────────────────────────────────────────

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

// ── CWOP ─────────────────────────────────────────────────

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

// ── Models ───────────────────────────────────────────────

export interface ModelListPayload {
  models: Array<{
    id: string;
    name: string;
    sizeGb: number;
    available: boolean;
  }>;
}

// ── Devices ──────────────────────────────────────────────

export type DeviceType = "technician" | "customer" | "official" | "racer";

export interface DeviceRegisterPayload {
  deviceType: DeviceType;
  name: string;
  key?: string;
}

export interface DeviceHeartbeatPayload {
  uptimeMs: number;
  batteryPct?: number;
}

export interface DeviceInfo {
  id: string;
  deviceType: DeviceType;
  name: string;
  connectedAt: number;
  lastHeartbeat: number;
  batteryPct?: number;
}

// ── Customer Display ─────────────────────────────────────

export interface CustomerStatusPayload {
  extensions: Array<{
    id: string;
    name: string;
    budgetPct: number;
    used: number;
    total: number;
    active: boolean;
  }>;
  sessionActive: boolean;
  toolCount: number;
  sessionDurationMs: number;
  connectedDevices: number;
}

// ── OBD ──────────────────────────────────────────────────

export interface OBDScanPayload {
  devices: Array<{ mac: string; name: string; type: string }>;
  count: number;
}

export interface OBDConnectPayload {
  mac: string;
  name?: string;
}

export interface OBDDataPayload {
  timestamp: number;
  rpm: number;
  speed: number;
  coolantTemp: number;
  intakeTemp: number;
  maf: number;
  throttlePos: number;
  engineLoad: number;
  stftB1: number;
  ltftB1: number;
  stftB2: number;
  ltftB2: number;
  timingAdvance: number;
  o2VoltageB1S1: number;
  dtcs: string[];
  dtcDetails: Array<{ code: string; desc: string; severity: string }>;
  source: string;
}

export interface OBDStatusPayload {
  connected: boolean;
  device: string;
  mac: string;
  source: string;
}

// ── Snapshots ────────────────────────────────────────────

export interface SnapshotRecordPayload {
  inputMethod: "obd" | "manual";
  readingType: string;
  mode: string;
  vehicleLabel?: string;
  takenBy: string;
  notes: string;
  carbData?: Record<string, unknown>;
}

export interface SnapshotListPayload {
  inputMethod?: "obd" | "manual";
  mode?: string;
  vehicleLabel?: string;
}

export interface SnapshotComparePayload {
  beforeId: string;
  afterId: string;
}

// ── Error ────────────────────────────────────────────────

export interface ErrorPayload {
  code: string;
  message: string;
  requestId?: string;
}
