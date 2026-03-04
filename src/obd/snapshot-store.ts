/**
 * Snapshot storage and comparison engine.
 * Saves engine snapshots (OBD or Carb) as JSON files.
 * Provides before/after comparison with severity flagging.
 */

import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

// ── Snapshot Types ───────────────────────────────────────────

export type ReadingType = "pre-race" | "post-race" | "pre-service" | "post-service" | "baseline" | "check";
export type OperatingMode = "shop" | "track" | "home";
export type InputMethod = "obd" | "manual";
export type ChangeSeverity = "normal" | "warning" | "critical";

interface SnapshotBase {
  id: string;
  timestamp: number;
  readingType: ReadingType;
  mode: OperatingMode;
  inputMethod: InputMethod;
  pairedWith?: string;
  vehicleLabel?: string;
  takenBy: string;
  notes: string;
}

export interface OBDSnapshot extends SnapshotBase {
  inputMethod: "obd";
  source: "veepeak" | "obdsim";
  vin?: string;
  rpm: number;
  coolantTemp: number;
  intakeTemp: number;
  engineLoad: number;
  throttlePos: number;
  maf: number;
  stftB1: number;
  ltftB1: number;
  stftB2: number;
  ltftB2: number;
  timingAdvance: number;
  o2VoltageB1S1: number;
  speed: number;
  dtcs: string[];
  dtcDetails: Array<{ code: string; desc: string; severity: string }>;
}

export interface CarbSnapshot extends SnapshotBase {
  inputMethod: "manual";
  source: "manual";
  primaryJets: number;
  secondaryJets?: number;
  floatLevel: number;
  needleAndSeat?: string;
  powerValve?: number;
  accelPumpCam?: string;
  idleMixtureOut: number;
  initialTiming: number;
  totalTiming?: number;
  timingNotes?: string;
  rpm: number;
  manifoldVacuum: number;
  coolantTemp: number;
  oilPressure: number;
  compression: number[];
  plugCondition: string[];
  plugGap: number;
}

export type EngineSnapshot = OBDSnapshot | CarbSnapshot;

export interface SnapshotChange {
  field: string;
  label: string;
  before: number | string;
  after: number | string;
  delta?: number;
  unit: string;
  severity: ChangeSeverity;
}

export interface SnapshotComparison {
  beforeId: string;
  afterId: string;
  inputMethod: InputMethod;
  changes: SnapshotChange[];
  newDtcs?: string[];
  clearedDtcs?: string[];
  compressionDelta?: Array<{ cyl: number; before: number; after: number; drop: number }>;
  plugChanges?: Array<{ cyl: number; before: string; after: string }>;
  summary: string;
}

// ── Store ────────────────────────────────────────────────────

const DEFAULT_DIR = "/home/pi/crew-chief-data/snapshots";

export class SnapshotStore {
  private dir: string;

  constructor(dir?: string) {
    this.dir = dir ?? DEFAULT_DIR;
  }

  async init(): Promise<void> {
    await mkdir(this.dir, { recursive: true });
  }

  async save(snapshot: EngineSnapshot): Promise<string> {
    await this.init();
    const path = join(this.dir, `${snapshot.id}.json`);
    await writeFile(path, JSON.stringify(snapshot, null, 2));
    return snapshot.id;
  }

  async get(id: string): Promise<EngineSnapshot | null> {
    try {
      const data = await readFile(join(this.dir, `${id}.json`), "utf-8");
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  async list(filters?: { inputMethod?: InputMethod; mode?: OperatingMode; vehicleLabel?: string }): Promise<EngineSnapshot[]> {
    await this.init();
    let files: string[];
    try {
      files = await readdir(this.dir);
    } catch {
      return [];
    }

    const snapshots: EngineSnapshot[] = [];
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      try {
        const data = await readFile(join(this.dir, file), "utf-8");
        const snap = JSON.parse(data) as EngineSnapshot;
        if (filters?.inputMethod && snap.inputMethod !== filters.inputMethod) continue;
        if (filters?.mode && snap.mode !== filters.mode) continue;
        if (filters?.vehicleLabel && snap.vehicleLabel !== filters.vehicleLabel) continue;
        snapshots.push(snap);
      } catch {
        // skip corrupt files
      }
    }

    return snapshots.sort((a, b) => b.timestamp - a.timestamp);
  }

  async compare(beforeId: string, afterId: string): Promise<SnapshotComparison | null> {
    const before = await this.get(beforeId);
    const after = await this.get(afterId);
    if (!before || !after) return null;
    if (before.inputMethod !== after.inputMethod) return null;

    if (before.inputMethod === "obd" && after.inputMethod === "obd") {
      return compareOBD(before, after);
    } else if (before.inputMethod === "manual" && after.inputMethod === "manual") {
      return compareCarb(before, after);
    }

    return null;
  }
}

// ── OBD Comparison ──────────────────────────────────────────

function compareOBD(before: OBDSnapshot, after: OBDSnapshot): SnapshotComparison {
  const changes: SnapshotChange[] = [];

  const fields: Array<{ field: keyof OBDSnapshot; label: string; unit: string; warnThreshold?: number; critThreshold?: number }> = [
    { field: "rpm", label: "RPM", unit: "RPM", warnThreshold: 100, critThreshold: 300 },
    { field: "coolantTemp", label: "Coolant Temp", unit: "°C", warnThreshold: 10, critThreshold: 20 },
    { field: "intakeTemp", label: "Intake Temp", unit: "°C", warnThreshold: 15, critThreshold: 30 },
    { field: "engineLoad", label: "Engine Load", unit: "%", warnThreshold: 15, critThreshold: 30 },
    { field: "maf", label: "MAF", unit: "g/s", warnThreshold: 1.5, critThreshold: 3 },
    { field: "stftB1", label: "STFT B1", unit: "%", warnThreshold: 8, critThreshold: 15 },
    { field: "ltftB1", label: "LTFT B1", unit: "%", warnThreshold: 8, critThreshold: 15 },
    { field: "stftB2", label: "STFT B2", unit: "%", warnThreshold: 8, critThreshold: 15 },
    { field: "ltftB2", label: "LTFT B2", unit: "%", warnThreshold: 8, critThreshold: 15 },
    { field: "timingAdvance", label: "Timing Advance", unit: "°", warnThreshold: 5, critThreshold: 10 },
    { field: "o2VoltageB1S1", label: "O2 Voltage B1S1", unit: "V", warnThreshold: 0.2, critThreshold: 0.4 },
    { field: "throttlePos", label: "Throttle Position", unit: "%", warnThreshold: 10, critThreshold: 25 },
    { field: "speed", label: "Speed", unit: "km/h" },
  ];

  for (const f of fields) {
    const bVal = before[f.field] as number;
    const aVal = after[f.field] as number;
    if (bVal === undefined || aVal === undefined) continue;
    const delta = aVal - bVal;
    if (Math.abs(delta) < 0.01) continue;

    let severity: ChangeSeverity = "normal";
    if (f.critThreshold && Math.abs(delta) >= f.critThreshold) severity = "critical";
    else if (f.warnThreshold && Math.abs(delta) >= f.warnThreshold) severity = "warning";

    changes.push({
      field: f.field,
      label: f.label,
      before: Math.round(bVal * 100) / 100,
      after: Math.round(aVal * 100) / 100,
      delta: Math.round(delta * 100) / 100,
      unit: f.unit,
      severity,
    });
  }

  // DTC changes
  const beforeDtcs = new Set(before.dtcs);
  const afterDtcs = new Set(after.dtcs);
  const newDtcs = [...afterDtcs].filter(c => !beforeDtcs.has(c));
  const clearedDtcs = [...beforeDtcs].filter(c => !afterDtcs.has(c));

  if (newDtcs.length > 0) {
    for (const dtc of newDtcs) {
      changes.push({
        field: "dtc", label: `New DTC: ${dtc}`, before: "—", after: dtc,
        unit: "", severity: "critical",
      });
    }
  }

  const summary = generateOBDSummary(changes, newDtcs, clearedDtcs);

  return {
    beforeId: before.id,
    afterId: after.id,
    inputMethod: "obd",
    changes,
    newDtcs: newDtcs.length > 0 ? newDtcs : undefined,
    clearedDtcs: clearedDtcs.length > 0 ? clearedDtcs : undefined,
    summary,
  };
}

function generateOBDSummary(changes: SnapshotChange[], newDtcs: string[], clearedDtcs: string[]): string {
  const parts: string[] = [];
  const criticals = changes.filter(c => c.severity === "critical");
  const warnings = changes.filter(c => c.severity === "warning");

  if (newDtcs.length > 0) {
    parts.push(`${newDtcs.length} new trouble code${newDtcs.length > 1 ? "s" : ""} appeared (${newDtcs.join(", ")})`);
  }
  if (clearedDtcs.length > 0) {
    parts.push(`${clearedDtcs.length} code${clearedDtcs.length > 1 ? "s" : ""} cleared (${clearedDtcs.join(", ")})`);
  }
  if (criticals.length > 0) {
    const labels = criticals.filter(c => c.field !== "dtc").map(c => c.label).join(", ");
    if (labels) parts.push(`Critical changes in: ${labels}`);
  }
  if (warnings.length > 0) {
    parts.push(`${warnings.length} parameter${warnings.length > 1 ? "s" : ""} shifted outside normal range`);
  }

  if (parts.length === 0) {
    parts.push("No significant changes detected between readings");
  }

  return parts.join(". ") + ".";
}

// ── Carb Comparison ─────────────────────────────────────────

function compareCarb(before: CarbSnapshot, after: CarbSnapshot): SnapshotComparison {
  const changes: SnapshotChange[] = [];

  // Numeric field comparisons
  const fields: Array<{ field: keyof CarbSnapshot; label: string; unit: string; warnThreshold?: number; critThreshold?: number }> = [
    { field: "primaryJets", label: "Primary Jets", unit: "" },
    { field: "secondaryJets", label: "Secondary Jets", unit: "" },
    { field: "floatLevel", label: "Float Level", unit: "\"" },
    { field: "idleMixtureOut", label: "Idle Mixture", unit: "turns" },
    { field: "powerValve", label: "Power Valve", unit: "\" Hg" },
    { field: "initialTiming", label: "Initial Timing", unit: "° BTDC", warnThreshold: 2, critThreshold: 5 },
    { field: "totalTiming", label: "Total Timing", unit: "°", warnThreshold: 3, critThreshold: 6 },
    { field: "rpm", label: "RPM", unit: "RPM", warnThreshold: 100, critThreshold: 300 },
    { field: "manifoldVacuum", label: "Manifold Vacuum", unit: "\" Hg", warnThreshold: 2, critThreshold: 4 },
    { field: "coolantTemp", label: "Coolant Temp", unit: "°F", warnThreshold: 15, critThreshold: 30 },
    { field: "oilPressure", label: "Oil Pressure", unit: "PSI", warnThreshold: 10, critThreshold: 20 },
    { field: "plugGap", label: "Plug Gap", unit: "\"" },
  ];

  for (const f of fields) {
    const bVal = before[f.field] as number | undefined;
    const aVal = after[f.field] as number | undefined;
    if (bVal === undefined || aVal === undefined) continue;
    const delta = aVal - bVal;
    if (Math.abs(delta) < 0.001) continue;

    let severity: ChangeSeverity = "normal";
    if (f.critThreshold && Math.abs(delta) >= f.critThreshold) severity = "critical";
    else if (f.warnThreshold && Math.abs(delta) >= f.warnThreshold) severity = "warning";

    // Special: oil pressure DROP is worse
    if (f.field === "oilPressure" && delta < -10) severity = "critical";

    changes.push({
      field: f.field as string,
      label: f.label,
      before: Math.round(bVal * 1000) / 1000,
      after: Math.round(aVal * 1000) / 1000,
      delta: Math.round(delta * 1000) / 1000,
      unit: f.unit,
      severity,
    });
  }

  // Compression per cylinder
  const compressionDelta: Array<{ cyl: number; before: number; after: number; drop: number }> = [];
  if (before.compression?.length && after.compression?.length) {
    const len = Math.min(before.compression.length, after.compression.length);
    for (let i = 0; i < len; i++) {
      const b = before.compression[i];
      const a = after.compression[i];
      const drop = b > 0 ? ((b - a) / b) * 100 : 0;
      if (Math.abs(a - b) >= 3) {
        compressionDelta.push({ cyl: i + 1, before: b, after: a, drop: Math.round(drop * 10) / 10 });
        const severity: ChangeSeverity = drop > 10 ? "critical" : drop > 5 ? "warning" : "normal";
        changes.push({
          field: `compression_${i + 1}`,
          label: `Cyl #${i + 1} Compression`,
          before: b,
          after: a,
          delta: a - b,
          unit: "PSI",
          severity,
        });
      }
    }
  }

  // Plug condition per cylinder
  const plugChanges: Array<{ cyl: number; before: string; after: string }> = [];
  if (before.plugCondition?.length && after.plugCondition?.length) {
    const len = Math.min(before.plugCondition.length, after.plugCondition.length);
    for (let i = 0; i < len; i++) {
      if (before.plugCondition[i] !== after.plugCondition[i]) {
        plugChanges.push({
          cyl: i + 1,
          before: before.plugCondition[i],
          after: after.plugCondition[i],
        });
        changes.push({
          field: `plug_${i + 1}`,
          label: `Cyl #${i + 1} Plug`,
          before: before.plugCondition[i],
          after: after.plugCondition[i],
          unit: "",
          severity: getPlugSeverity(before.plugCondition[i], after.plugCondition[i]),
        });
      }
    }
  }

  const summary = generateCarbSummary(changes, compressionDelta, plugChanges);

  return {
    beforeId: before.id,
    afterId: after.id,
    inputMethod: "manual",
    changes,
    compressionDelta: compressionDelta.length > 0 ? compressionDelta : undefined,
    plugChanges: plugChanges.length > 0 ? plugChanges : undefined,
    summary,
  };
}

function getPlugSeverity(before: string, after: string): ChangeSeverity {
  const bad = ["oily", "fouled", "wet"];
  const warn = ["dark", "white"];
  if (bad.includes(after.toLowerCase())) return "critical";
  if (warn.includes(after.toLowerCase()) && before.toLowerCase() === "tan") return "warning";
  return "normal";
}

function generateCarbSummary(
  changes: SnapshotChange[],
  compressionDelta: Array<{ cyl: number; drop: number }>,
  plugChanges: Array<{ cyl: number; before: string; after: string }>,
): string {
  const parts: string[] = [];

  const critComps = compressionDelta.filter(c => c.drop > 10);
  if (critComps.length > 0) {
    const cyls = critComps.map(c => `#${c.cyl} (${c.drop}%)`).join(", ");
    parts.push(`Significant compression loss in cylinder${critComps.length > 1 ? "s" : ""} ${cyls}`);
  }

  const oilChange = changes.find(c => c.field === "oilPressure" && c.severity !== "normal");
  if (oilChange && typeof oilChange.delta === "number" && oilChange.delta < 0) {
    parts.push(`Oil pressure dropped ${Math.abs(oilChange.delta)} PSI`);
  }

  const coolantChange = changes.find(c => c.field === "coolantTemp" && c.severity !== "normal");
  if (coolantChange && typeof coolantChange.delta === "number" && coolantChange.delta > 0) {
    parts.push(`Coolant temp increased ${coolantChange.delta}°F`);
  }

  if (plugChanges.length > 0) {
    const richPlugs = plugChanges.filter(p => p.after.toLowerCase() === "dark");
    const leanPlugs = plugChanges.filter(p => p.after.toLowerCase() === "white");
    if (richPlugs.length > 0) {
      parts.push(`Cylinder${richPlugs.length > 1 ? "s" : ""} ${richPlugs.map(p => `#${p.cyl}`).join(", ")} reading rich`);
    }
    if (leanPlugs.length > 0) {
      parts.push(`Cylinder${leanPlugs.length > 1 ? "s" : ""} ${leanPlugs.map(p => `#${p.cyl}`).join(", ")} reading lean`);
    }
  }

  const vacuumChange = changes.find(c => c.field === "manifoldVacuum" && c.severity !== "normal");
  if (vacuumChange && typeof vacuumChange.delta === "number" && vacuumChange.delta < 0) {
    parts.push(`Manifold vacuum dropped ${Math.abs(vacuumChange.delta)}" — possible leak or ring wear`);
  }

  if (parts.length === 0) {
    parts.push("No significant changes detected between readings");
  }

  return parts.join(". ") + ".";
}
