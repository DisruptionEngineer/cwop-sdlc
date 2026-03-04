import type {
  WSMessage, WSMessageType,
  DeviceRegisterPayload, DeviceHeartbeatPayload,
  OBDConnectPayload, SnapshotRecordPayload, SnapshotListPayload, SnapshotComparePayload,
} from "../types/gateway.js";
import type { ExtensionRegistry } from "../registry/extension-registry.js";
import type { OllamaProvider } from "../llm/ollama.provider.js";
import type { CWOPSdlcConfig } from "../../config/cwop-sdlc.config.js";
import type { WSClient } from "./server.js";
import { connectSim, disconnectSim, isSimConnected } from "./server.js";
import type { OBDBridge } from "../obd/obd-bridge.js";
import type { SnapshotStore, OBDSnapshot, CarbSnapshot, ReadingType, OperatingMode, InputMethod } from "../obd/snapshot-store.js";

interface WSContext {
  registry: ExtensionRegistry;
  ollama: OllamaProvider;
  config: CWOPSdlcConfig;
  broadcast: (msg: WSMessage) => void;
  broadcastToCustomers: (msg: WSMessage) => void;
  client: WSClient;
  wsClients: Map<string, WSClient>;
  getSessionInfo: () => { sessionStartTime: number; totalToolCount: number };
  bridge: OBDBridge;
  snapshots: SnapshotStore;
}

export async function handleWebSocket(
  msg: WSMessage,
  ws: { send: (data: string) => void },
  ctx: WSContext,
): Promise<void> {
  const { registry, ollama, broadcast, broadcastToCustomers, client, wsClients, getSessionInfo, bridge, snapshots } = ctx;

  switch (msg.type) {
    case "ping":
      ws.send(JSON.stringify(makeMsg("pong", {})));
      break;

    // ── Device registration ──
    case "device.register": {
      const payload = msg.payload as DeviceRegisterPayload;
      if (payload.deviceType) client.deviceType = payload.deviceType;
      if (payload.name) client.name = payload.name;
      console.log(`[ws] Device registered: ${client.id} as ${client.deviceType}:${client.name}`);
      ws.send(JSON.stringify(makeMsg("device.register", { success: true, deviceType: client.deviceType, name: client.name })));

      // If customer, immediately send current status
      if (client.deviceType === "customer") {
        ws.send(JSON.stringify(makeMsg("customer.status", buildCustomerStatus(registry, getSessionInfo, wsClients))));
      }
      // Notify all clients about device list change
      {
        const devices = Array.from(wsClients.values())
          .filter(c => c.authenticated)
          .map(c => ({
            id: c.id,
            deviceType: c.deviceType,
            name: c.name,
            connectedAt: c.connectedAt,
          }));
        broadcast(makeMsg("devices.list", { devices, count: devices.length, simConnected: isSimConnected() }));
      }
      break;
    }

    // ── Device heartbeat ──
    case "device.heartbeat": {
      const payload = msg.payload as DeviceHeartbeatPayload;
      client.lastHeartbeat = Date.now();
      if (payload.batteryPct !== undefined) client.batteryPct = payload.batteryPct;
      ws.send(JSON.stringify(makeMsg("device.heartbeat", { ack: true })));
      break;
    }

    // ── Customer status request ──
    case "customer.status":
      ws.send(JSON.stringify(makeMsg("customer.status", buildCustomerStatus(registry, getSessionInfo, wsClients))));
      break;

    case "extension.list":
      ws.send(JSON.stringify(makeMsg("extension.list", registry.listExtensions())));
      break;

    case "cwop.status": {
      const payload = msg.payload as { extensionId: string };
      const status = registry.getBudgetStatus(payload.extensionId);
      ws.send(JSON.stringify(makeMsg("cwop.update", { extensionId: payload.extensionId, status })));
      broadcastToCustomers(makeMsg("customer.status", buildCustomerStatus(registry, getSessionInfo, wsClients)));
      break;
    }

    case "model.list": {
      const models = await ollama.listModels();
      ws.send(JSON.stringify(makeMsg("model.list", { models })));
      break;
    }

    case "model.health": {
      const health = await ollama.healthCheck();
      ws.send(JSON.stringify(makeMsg("model.health", health)));
      break;
    }

    case "chat.send": {
      const chatPayload = msg.payload as { extensionId: string; message: string };
      const engine = registry.getEngine(chatPayload.extensionId);
      if (!engine) {
        ws.send(JSON.stringify(makeMsg("error", { code: "EXT_NOT_FOUND", message: "Extension not found" })));
        return;
      }

      engine.updateSlot("target_spec", chatPayload.message);
      const context = engine.assembleContext();
      const model = registry.getModel(chatPayload.extensionId);

      try {
        await ollama.stream(
          {
            model,
            messages: [
              { role: "system", content: context },
              { role: "user", content: chatPayload.message },
            ],
            temperature: 0.2,
          },
          (chunk) => {
            ws.send(JSON.stringify(makeMsg("chat.stream_chunk", {
              requestId: msg.id,
              extensionId: chatPayload.extensionId,
              delta: chunk.delta,
              done: chunk.done,
            })));
          },
        );

        ws.send(JSON.stringify(makeMsg("chat.done", {
          requestId: msg.id,
          extensionId: chatPayload.extensionId,
          cwopStatus: registry.getBudgetStatus(chatPayload.extensionId),
        })));

        broadcastToCustomers(makeMsg("customer.status", buildCustomerStatus(registry, getSessionInfo, wsClients)));
      } catch (err) {
        ws.send(JSON.stringify(makeMsg("error", {
          code: "LLM_ERROR",
          message: err instanceof Error ? err.message : String(err),
          requestId: msg.id,
        })));
      }
      break;
    }

    // ── Mode sync (tech handheld → all clients) ──
    case "mode.change": {
      const payload = msg.payload as { mode: string };
      broadcast(makeMsg("mode.change", { mode: payload.mode }));
      break;
    }

    // ── Sim scenario control (proxy to OBD sim) ──
    case "sim.scenarios": {
      try {
        const res = await fetch("http://10.10.7.54:8080/api/scenarios", { signal: AbortSignal.timeout(3000) });
        const data = await res.json();
        ws.send(JSON.stringify(makeMsg("sim.scenarios", data)));
      } catch {
        ws.send(JSON.stringify(makeMsg("sim.scenarios", { scenarios: [], count: 0, error: "Sim unreachable" })));
      }
      break;
    }

    case "sim.select": {
      const payload = msg.payload as { scenario: string };
      try {
        await fetch(`http://10.10.7.54:8080/scenario/${payload.scenario}`, { signal: AbortSignal.timeout(3000) });
        // Re-fetch and broadcast new scenario list so all clients stay in sync
        const res = await fetch("http://10.10.7.54:8080/api/scenarios", { signal: AbortSignal.timeout(3000) });
        const data = await res.json();
        broadcast(makeMsg("sim.scenarios", data));
      } catch {
        ws.send(JSON.stringify(makeMsg("error", { code: "SIM_SELECT_FAIL", message: "Could not change scenario" })));
      }
      break;
    }

    // ── Sim direct connect / disconnect ──
    case "sim.connect": {
      const result = await connectSim();
      ws.send(JSON.stringify(makeMsg("sim.connect", result)));
      if (result.connected) {
        // Send scenario list to all clients
        try {
          const res = await fetch("http://10.10.7.54:8080/api/scenarios", { signal: AbortSignal.timeout(3000) });
          const data = await res.json();
          broadcast(makeMsg("sim.scenarios", data));
        } catch {}
      }
      break;
    }

    case "sim.disconnect": {
      await disconnectSim();
      ws.send(JSON.stringify(makeMsg("sim.disconnect", { connected: false })));
      break;
    }

    // ── Device list request ──
    case "devices.list": {
      const devices = Array.from(wsClients.values())
        .filter(c => c.authenticated)
        .map(c => ({
          id: c.id,
          deviceType: c.deviceType,
          name: c.name,
          connectedAt: c.connectedAt,
        }));
      ws.send(JSON.stringify(makeMsg("devices.list", { devices, count: devices.length, simConnected: isSimConnected() })));
      break;
    }

    // ── OBD Bluetooth ──
    case "obd.scan": {
      try {
        const result = await bridge.scan();
        ws.send(JSON.stringify(makeMsg("obd.scan", result)));
      } catch (err) {
        ws.send(JSON.stringify(makeMsg("error", { code: "OBD_SCAN_FAIL", message: err instanceof Error ? err.message : String(err) })));
      }
      break;
    }

    case "obd.connect": {
      const payload = msg.payload as OBDConnectPayload;
      try {
        const result = await bridge.connect(payload.mac, payload.name);
        ws.send(JSON.stringify(makeMsg("obd.status", result)));
        broadcast(makeMsg("obd.status", result));
      } catch (err) {
        ws.send(JSON.stringify(makeMsg("error", { code: "OBD_CONNECT_FAIL", message: err instanceof Error ? err.message : String(err) })));
      }
      break;
    }

    case "obd.disconnect": {
      try {
        await bridge.disconnect();
        const status = { connected: false, device: "", mac: "", source: "none" };
        ws.send(JSON.stringify(makeMsg("obd.status", status)));
        broadcast(makeMsg("obd.status", status));
      } catch (err) {
        ws.send(JSON.stringify(makeMsg("error", { code: "OBD_DISCONNECT_FAIL", message: err instanceof Error ? err.message : String(err) })));
      }
      break;
    }

    case "obd.status": {
      try {
        const status = await bridge.status();
        ws.send(JSON.stringify(makeMsg("obd.status", status)));
      } catch (err) {
        ws.send(JSON.stringify(makeMsg("obd.status", { connected: false, device: "", mac: "", source: "none" })));
      }
      break;
    }

    // ── Snapshot Recording ──
    case "snapshot.record": {
      const payload = msg.payload as SnapshotRecordPayload;
      try {
        const id = crypto.randomUUID();
        const now = Date.now();

        if (payload.inputMethod === "obd") {
          // Fetch live data from bridge
          const obdData = await bridge.snapshot();
          const dtcData = await bridge.dtcs();

          const snapshot: OBDSnapshot = {
            id,
            timestamp: now,
            readingType: payload.readingType as ReadingType,
            mode: payload.mode as OperatingMode,
            inputMethod: "obd",
            source: obdData.source as "veepeak" | "obdsim",
            vehicleLabel: payload.vehicleLabel,
            takenBy: payload.takenBy,
            notes: payload.notes,
            rpm: obdData.rpm,
            coolantTemp: obdData.coolantTemp,
            intakeTemp: obdData.intakeTemp,
            engineLoad: obdData.engineLoad,
            throttlePos: obdData.throttlePos,
            maf: obdData.maf,
            stftB1: obdData.stftB1,
            ltftB1: obdData.ltftB1,
            stftB2: obdData.stftB2,
            ltftB2: obdData.ltftB2,
            timingAdvance: obdData.timingAdvance,
            o2VoltageB1S1: obdData.o2VoltageB1S1,
            speed: obdData.speed,
            dtcs: obdData.dtcs,
            dtcDetails: dtcData.dtcs.map(d => ({ code: d.code, desc: d.desc, severity: d.severity })),
          };

          await snapshots.save(snapshot);
          const savedMsg = makeMsg("snapshot.saved", snapshot);
          ws.send(JSON.stringify(savedMsg));
          broadcast(savedMsg);
        } else {
          // Carb/manual — data comes from the payload
          const carbData = payload.carbData ?? {};
          const snapshot: CarbSnapshot = {
            id,
            timestamp: now,
            readingType: payload.readingType as ReadingType,
            mode: payload.mode as OperatingMode,
            inputMethod: "manual",
            source: "manual",
            vehicleLabel: payload.vehicleLabel,
            takenBy: payload.takenBy,
            notes: payload.notes,
            primaryJets: (carbData.primaryJets as number) ?? 0,
            secondaryJets: carbData.secondaryJets as number | undefined,
            floatLevel: (carbData.floatLevel as number) ?? 0,
            needleAndSeat: carbData.needleAndSeat as string | undefined,
            powerValve: carbData.powerValve as number | undefined,
            accelPumpCam: carbData.accelPumpCam as string | undefined,
            idleMixtureOut: (carbData.idleMixtureOut as number) ?? 0,
            initialTiming: (carbData.initialTiming as number) ?? 0,
            totalTiming: carbData.totalTiming as number | undefined,
            timingNotes: carbData.timingNotes as string | undefined,
            rpm: (carbData.rpm as number) ?? 0,
            manifoldVacuum: (carbData.manifoldVacuum as number) ?? 0,
            coolantTemp: (carbData.coolantTemp as number) ?? 0,
            oilPressure: (carbData.oilPressure as number) ?? 0,
            compression: (carbData.compression as number[]) ?? [],
            plugCondition: (carbData.plugCondition as string[]) ?? [],
            plugGap: (carbData.plugGap as number) ?? 0.035,
          };

          await snapshots.save(snapshot);
          const savedMsg = makeMsg("snapshot.saved", snapshot);
          ws.send(JSON.stringify(savedMsg));
          broadcast(savedMsg);
        }
      } catch (err) {
        ws.send(JSON.stringify(makeMsg("error", { code: "SNAPSHOT_FAIL", message: err instanceof Error ? err.message : String(err) })));
      }
      break;
    }

    case "snapshot.list": {
      const payload = (msg.payload ?? {}) as SnapshotListPayload;
      try {
        const list = await snapshots.list({
          inputMethod: payload.inputMethod as InputMethod | undefined,
          mode: payload.mode as OperatingMode | undefined,
          vehicleLabel: payload.vehicleLabel,
        });
        ws.send(JSON.stringify(makeMsg("snapshot.list", { snapshots: list, count: list.length })));
      } catch (err) {
        ws.send(JSON.stringify(makeMsg("error", { code: "SNAPSHOT_LIST_FAIL", message: err instanceof Error ? err.message : String(err) })));
      }
      break;
    }

    case "snapshot.compare": {
      const payload = msg.payload as SnapshotComparePayload;
      try {
        const comparison = await snapshots.compare(payload.beforeId, payload.afterId);
        if (!comparison) {
          ws.send(JSON.stringify(makeMsg("error", { code: "COMPARE_FAIL", message: "Snapshots not found or incompatible types" })));
        } else {
          ws.send(JSON.stringify(makeMsg("snapshot.compare", comparison)));
        }
      } catch (err) {
        ws.send(JSON.stringify(makeMsg("error", { code: "COMPARE_FAIL", message: err instanceof Error ? err.message : String(err) })));
      }
      break;
    }

    default:
      ws.send(JSON.stringify(makeMsg("error", { code: "UNKNOWN_TYPE", message: `Unknown message type: ${msg.type}` })));
  }
}

function buildCustomerStatus(
  registry: ExtensionRegistry,
  getSessionInfo: () => { sessionStartTime: number; totalToolCount: number },
  wsClients: Map<string, WSClient>,
) {
  const sessionInfo = getSessionInfo();
  const extensions = registry.listExtensions().map((ext: any) => {
    const budget = registry.getBudgetStatus(ext.id);
    return {
      id: ext.id,
      name: ext.name,
      budgetPct: budget?.utilizationPct ?? 0,
      used: budget?.used ?? 0,
      total: budget?.totalBudget ?? 0,
      active: (budget?.used ?? 0) > 0,
    };
  });

  return {
    extensions,
    sessionActive: true,
    toolCount: sessionInfo.totalToolCount,
    sessionDurationMs: Date.now() - sessionInfo.sessionStartTime,
    connectedDevices: Array.from(wsClients.values()).filter(c => c.authenticated).length,
  };
}

function makeMsg(type: WSMessageType, payload: unknown): WSMessage {
  return { id: crypto.randomUUID(), type, payload, timestamp: Date.now() };
}
