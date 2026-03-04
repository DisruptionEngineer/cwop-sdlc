/**
 * Crew Chief Diagnostics — Primary Handheld Controller
 * Handles OBD-II + Carb/Manual input, snapshot recording, and comparison.
 */

import { WSClient } from "./ws-client.js";

const ws = new WSClient();

// ── State ────────────────────────────────────────────────
let inputMethod = "obd";  // "obd" | "manual"
let mode = "track";
let btConnected = false;
let simActive = false;
let snapshots = [];
let compareBeforeId = null;

// ── DOM Refs ─────────────────────────────────────────────
const modeSelect = document.getElementById("mode-select");
const wsStatus = document.getElementById("ws-status");
const obdPanel = document.getElementById("obd-panel");
const carbPanel = document.getElementById("carb-panel");
const btStatusText = document.getElementById("bt-status-text");
const btScanBtn = document.getElementById("bt-scan-btn");
const simConnectBtn = document.getElementById("sim-connect-btn");
const btDisconnectBtn = document.getElementById("bt-disconnect-btn");
const btDevices = document.getElementById("bt-devices");
const dtcRow = document.getElementById("dtc-row");
const dtcBadges = document.getElementById("dtc-badges");
const readingsList = document.getElementById("readings-list");
const comparisonPanel = document.getElementById("comparison-panel");
const comparisonContent = document.getElementById("comparison-content");
const recordButtons = document.getElementById("record-buttons");
const deviceChips = document.getElementById("device-chips");
const simStatusBadge = document.getElementById("sim-status-badge");

// ── Input Method Toggle ──────────────────────────────────
document.querySelectorAll(".toggle-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".toggle-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    inputMethod = btn.dataset.method;
    obdPanel.classList.toggle("active", inputMethod === "obd");
    carbPanel.classList.toggle("active", inputMethod === "manual");
  });
});

// ── Mode Select ──────────────────────────────────────────
modeSelect.addEventListener("change", () => {
  mode = modeSelect.value;
  updateRecordLabels();
  // Broadcast mode change to all connected clients (customer viewer, etc.)
  ws.send("mode.change", { mode });
});

function updateRecordLabels() {
  const labels = {
    track: ["PRE-RACE", "POST-RACE", "BASELINE"],
    shop: ["PRE-SERVICE", "POST-SERVICE", "BASELINE"],
    home: ["BEFORE", "AFTER", "CHECK"],
  };
  const types = {
    track: ["pre-race", "post-race", "baseline"],
    shop: ["pre-service", "post-service", "baseline"],
    home: ["baseline", "check", "check"],
  };
  const btns = recordButtons.querySelectorAll(".btn-record");
  const l = labels[mode] || labels.track;
  const t = types[mode] || types.track;
  btns.forEach((btn, i) => {
    btn.textContent = l[i];
    btn.dataset.type = t[i];
  });
}

// ── WebSocket Handlers ───────────────────────────────────
ws.on("connected", () => {
  updateWSStatus(true);
  // Register this device as the technician handheld
  ws.send("device.register", { deviceType: "technician", name: "tech-handheld" });
  ws.send("obd.status");
  ws.send("snapshot.list");
  ws.send("devices.list");
  // Broadcast current mode so customer viewer picks it up
  ws.send("mode.change", { mode });
});

ws.on("disconnected", () => updateWSStatus(false));

ws.on("obd.status", (data) => {
  btConnected = data.connected;
  if (data.connected) {
    btStatusText.textContent = `Connected to ${data.device || data.source || "OBD"}`;
    btScanBtn.style.display = "none";
    simConnectBtn.style.display = "none";
    btDisconnectBtn.style.display = "";
  } else {
    btStatusText.textContent = "Not Connected";
    btScanBtn.style.display = "";
    simConnectBtn.style.display = "";
    btDisconnectBtn.style.display = "none";
  }
  btDevices.style.display = "none";
});

ws.on("obd.scan", (data) => {
  btScanBtn.disabled = false;
  btScanBtn.textContent = "Scan";
  if (data.devices && data.devices.length > 0) {
    btDevices.style.display = "";
    btDevices.innerHTML = data.devices.map(d => `
      <div class="bt-device-item" data-mac="${d.mac}" data-name="${d.name}">
        <span class="bt-device-name">${d.name}</span>
        <span class="bt-device-mac">${d.mac}</span>
      </div>
    `).join("");
  } else {
    btDevices.style.display = "";
    btDevices.innerHTML = '<p class="empty-state">No devices found</p>';
  }
});

ws.on("obd.data", (data) => {
  if (!data) return;
  updateGauge("g-rpm", Math.round(data.rpm));
  updateGauge("g-coolant", `${Math.round(data.coolantTemp)}°`);
  updateGauge("g-load", `${Math.round(data.engineLoad)}%`);
  updateGauge("g-throttle", `${Math.round(data.throttlePos)}%`);
  updateTrim("g-stft1", data.stftB1);
  updateTrim("g-ltft1", data.ltftB1);
  updateTrim("g-stft2", data.stftB2);
  updateTrim("g-ltft2", data.ltftB2);
  updateGauge("g-maf", `${data.maf?.toFixed(1)}`);
  updateGauge("g-o2", `${data.o2VoltageB1S1?.toFixed(2)}V`);
  updateGauge("g-timing", `${data.timingAdvance?.toFixed(1)}°`);
  updateGauge("g-speed", `${Math.round(data.speed || 0)}`);

  // DTCs
  const dtcs = data.dtcs || [];
  if (dtcs.length > 0) {
    dtcRow.style.display = "";
    dtcBadges.innerHTML = dtcs.map(c => `<span class="dtc-badge">${c}</span>`).join("");
  } else {
    dtcRow.style.display = "none";
  }
});

ws.on("sim.connect", (data) => {
  simConnectBtn.disabled = false;
  if (data.connected) {
    simConnectBtn.textContent = "Connect Sim";
    simActive = true;
  } else {
    simConnectBtn.textContent = "Connect Sim";
    simActive = false;
  }
});

ws.on("sim.disconnect", () => {
  simActive = false;
  simConnectBtn.textContent = "Connect Sim";
});

ws.on("devices.list", (data) => {
  renderDevices(data);
});

ws.on("snapshot.saved", (snap) => {
  snapshots.unshift(snap);
  renderReadings();
});

ws.on("snapshot.list", (data) => {
  snapshots = data.snapshots || [];
  renderReadings();
});

ws.on("snapshot.compare", (comparison) => {
  renderComparison(comparison);
});

ws.on("error", (err) => {
  console.error("[gateway error]", err);
});

// ── Device Rendering ─────────────────────────────────────

function renderDevices(data) {
  const devices = data?.devices || [];
  const simOn = data?.simConnected || false;

  if (devices.length === 0) {
    deviceChips.innerHTML = '<span class="device-chip offline">No devices</span>';
  } else {
    deviceChips.innerHTML = devices.map(d => {
      const cls = d.deviceType === "technician" ? "tech" : d.deviceType === "customer" ? "customer" : "tech";
      const label = d.name === "unknown" ? d.deviceType : d.name;
      return `<span class="device-chip ${cls}">${label}</span>`;
    }).join("");
  }

  simStatusBadge.style.display = simOn ? "" : "none";
  simActive = simOn;
}

// ── BT Controls ──────────────────────────────────────────
btScanBtn.addEventListener("click", () => {
  btScanBtn.disabled = true;
  btScanBtn.textContent = "Scanning...";
  ws.send("obd.scan");
});

simConnectBtn.addEventListener("click", () => {
  simConnectBtn.disabled = true;
  simConnectBtn.textContent = "Connecting...";
  ws.send("sim.connect");
});

btDisconnectBtn.addEventListener("click", () => {
  if (simActive) {
    ws.send("sim.disconnect");
  } else {
    ws.send("obd.disconnect");
  }
});

btDevices.addEventListener("click", (e) => {
  const item = e.target.closest(".bt-device-item");
  if (!item) return;
  btStatusText.textContent = `Connecting to ${item.dataset.name}...`;
  btDevices.style.display = "none";
  ws.send("obd.connect", {
    mac: item.dataset.mac,
    name: item.dataset.name,
  });
});

// ── Record Buttons ───────────────────────────────────────
recordButtons.addEventListener("click", (e) => {
  const btn = e.target.closest(".btn-record");
  if (!btn) return;

  const readingType = btn.dataset.type;
  const vehicleLabel = document.getElementById("vehicle-label").value.trim();
  const takenBy = document.getElementById("taken-by").value.trim();
  const notes = document.getElementById("snap-notes").value.trim();

  if (!takenBy) {
    alert("Please enter your name in the 'Taken by' field.");
    return;
  }

  const payload = {
    inputMethod,
    readingType,
    mode,
    vehicleLabel: vehicleLabel || undefined,
    takenBy,
    notes: notes || "",
  };

  if (inputMethod === "manual") {
    payload.carbData = collectCarbData();
  }

  btn.disabled = true;
  btn.textContent = "Saving...";
  ws.send("snapshot.record", payload);

  setTimeout(() => {
    btn.disabled = false;
    updateRecordLabels();
  }, 1500);
});

// ── Refresh Readings ─────────────────────────────────────
document.getElementById("btn-refresh-readings").addEventListener("click", () => {
  ws.send("snapshot.list");
});

// ── Close Comparison ─────────────────────────────────────
document.getElementById("btn-close-compare").addEventListener("click", () => {
  comparisonPanel.style.display = "none";
});

// ── Helpers ──────────────────────────────────────────────

function updateWSStatus(connected) {
  const dot = wsStatus.querySelector(".status-dot");
  const text = wsStatus.querySelector("span:last-child");
  dot.className = `status-dot ${connected ? "healthy" : "unhealthy"}`;
  text.textContent = connected ? "Online" : "Offline";
}

function updateGauge(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function updateTrim(id, value) {
  const el = document.getElementById(id);
  if (!el || value === undefined) return;
  el.textContent = `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
  el.className = "trim-value";
  if (Math.abs(value) > 15) el.classList.add("crit");
  else if (Math.abs(value) > 8) el.classList.add("warn");
}

function collectCarbData() {
  const num = (id) => {
    const v = document.getElementById(id)?.value;
    return v ? parseFloat(v) : undefined;
  };
  const str = (id) => document.getElementById(id)?.value || undefined;

  const compression = [];
  for (let i = 1; i <= 8; i++) {
    const v = num(`c-comp-${i}`);
    compression.push(v ?? 0);
  }

  const plugCondition = [];
  for (let i = 1; i <= 8; i++) {
    plugCondition.push(str(`c-plug-${i}`) || "tan");
  }

  return {
    primaryJets: num("c-pri-jets"),
    secondaryJets: num("c-sec-jets"),
    floatLevel: num("c-float"),
    needleAndSeat: str("c-needle-seat"),
    powerValve: num("c-power-valve"),
    accelPumpCam: str("c-accel-pump"),
    idleMixtureOut: num("c-idle-mix"),
    initialTiming: num("c-init-timing"),
    totalTiming: num("c-total-timing"),
    timingNotes: str("c-timing-notes"),
    rpm: num("c-rpm"),
    manifoldVacuum: num("c-vacuum"),
    coolantTemp: num("c-coolant"),
    oilPressure: num("c-oil"),
    compression,
    plugCondition,
    plugGap: num("c-plug-gap") || 0.035,
  };
}

function renderReadings() {
  if (snapshots.length === 0) {
    readingsList.innerHTML = '<p class="empty-state">No readings yet. Record a snapshot to get started.</p>';
    return;
  }

  readingsList.innerHTML = snapshots.slice(0, 20).map(snap => {
    const time = new Date(snap.timestamp).toLocaleString("en-US", {
      month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit",
    });
    return `
      <div class="reading-item" data-id="${snap.id}">
        <span class="reading-type ${snap.readingType}">${snap.readingType.replace("-", " ")}</span>
        <span class="reading-time">${time}</span>
        <span class="reading-vehicle">${snap.vehicleLabel || ""}</span>
        <span class="reading-method">${snap.inputMethod}</span>
        <button class="btn btn-sm btn-compare" data-compare="${snap.id}">Compare</button>
      </div>
    `;
  }).join("");
}

readingsList.addEventListener("click", (e) => {
  const btn = e.target.closest(".btn-compare");
  if (!btn) return;

  const id = btn.dataset.compare;
  if (!compareBeforeId) {
    compareBeforeId = id;
    btn.textContent = "Before set";
    btn.classList.add("btn-pre");
  } else {
    ws.send("snapshot.compare", {
      beforeId: compareBeforeId,
      afterId: id,
    });
    compareBeforeId = null;
    // Reset all compare buttons
    readingsList.querySelectorAll(".btn-compare").forEach(b => {
      b.textContent = "Compare";
      b.classList.remove("btn-pre");
    });
  }
});

function renderComparison(comparison) {
  comparisonPanel.style.display = "";

  let html = `
    <div class="compare-row" style="font-weight:700;color:var(--text-muted);font-size:11px;text-transform:uppercase">
      <span>Parameter</span><span style="text-align:center">Before</span><span style="text-align:center">After</span><span style="text-align:center">Delta</span><span style="text-align:center">Status</span>
    </div>
  `;

  for (const change of comparison.changes) {
    const delta = change.delta !== undefined ? (change.delta > 0 ? `+${change.delta}` : change.delta) : "—";
    html += `
      <div class="compare-row">
        <span class="compare-label">${change.label}</span>
        <span class="compare-before">${change.before}</span>
        <span class="compare-after">${change.after}</span>
        <span class="compare-delta severity-${change.severity}">${delta} ${change.unit}</span>
        <span class="compare-severity severity-${change.severity}">${change.severity}</span>
      </div>
    `;
  }

  if (comparison.summary) {
    html += `<div class="compare-summary">${comparison.summary}</div>`;
  }

  comparisonContent.innerHTML = html;
  comparisonPanel.scrollIntoView({ behavior: "smooth" });
}

// ── Boot ─────────────────────────────────────────────────
ws.connect();
updateRecordLabels();

// Poll OBD status every 5s
setInterval(() => {
  if (ws.ws?.readyState === WebSocket.OPEN) {
    ws.send("obd.status");
  }
}, 5000);
