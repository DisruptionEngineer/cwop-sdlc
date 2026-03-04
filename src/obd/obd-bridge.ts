/**
 * HTTP client for the local OBD Bridge service (obd_service.py on port 8081).
 * Provides typed wrappers around the bridge's REST API.
 */

export interface BTDevice {
  mac: string;
  name: string;
  type: string;
}

export interface BTStatus {
  connected: boolean;
  device: string;
  mac: string;
  source: "veepeak" | "obdsim" | "none";
}

export interface OBDSnapshotData {
  timestamp: number;
  rpm: number;
  speed: number;
  coolantTemp: number;
  intakeTemp: number;
  maf: number;
  throttlePos: number;
  engineLoad: number;
  fuelPressure: number;
  stftB1: number;
  ltftB1: number;
  stftB2: number;
  ltftB2: number;
  timingAdvance: number;
  o2VoltageB1S1: number;
  fuelStatus: string;
  dtcs: string[];
  source: string;
  formatted: Record<string, string>;
}

export interface DTCDetail {
  code: string;
  desc: string;
  severity: string;
  system: string;
  commonCauses: string[];
}

export class OBDBridge {
  private baseUrl: string;

  constructor(baseUrl = "http://127.0.0.1:8081") {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async scan(): Promise<{ devices: BTDevice[]; count: number }> {
    return this.get("/api/bt/scan");
  }

  async connect(mac: string, name?: string): Promise<BTStatus & { connected: boolean }> {
    return this.post("/api/bt/connect", { mac, name: name ?? "Unknown" });
  }

  async disconnect(): Promise<{ connected: boolean }> {
    return this.post("/api/bt/disconnect", {});
  }

  async status(): Promise<BTStatus> {
    return this.get("/api/bt/status");
  }

  async snapshot(): Promise<OBDSnapshotData> {
    return this.get("/api/obd/snapshot");
  }

  async dtcs(): Promise<{ dtcs: DTCDetail[]; count: number; source: string }> {
    return this.get("/api/obd/dtcs");
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/health`, { signal: AbortSignal.timeout(3000) });
      return res.ok;
    } catch {
      return false;
    }
  }

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error((body as any).error ?? `Bridge error: ${res.status}`);
    }
    return res.json() as Promise<T>;
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error((data as any).error ?? `Bridge error: ${res.status}`);
    }
    return res.json() as Promise<T>;
  }
}
