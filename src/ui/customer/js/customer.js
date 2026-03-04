/**
 * Crew Chief Viewer Display
 * Connects to gateway WebSocket. Shows live OBD data, snapshot summaries,
 * and before/after comparisons. Mode-adaptive (shop/track/home).
 * Designed for Pi Zero 2 W + HyperPixel 4 Square (720x720).
 */

const WS_URL = `ws://${location.host}/ws`;
const HEARTBEAT_INTERVAL = 15_000;
const apiKey = new URLSearchParams(location.search).get("key") ?? "";

let ws = null;
let reconnectDelay = 1000;
let heartbeatTimer = null;
let currentMode = "track";
let obdConnected = false;

// DOM
const statusDot = document.getElementById("status-dot");
const modeLabel = document.getElementById("mode-label");
const liveStrip = document.getElementById("live-strip");
const liveDtcs = document.getElementById("lv-dtcs");
const liveDtcList = document.getElementById("lv-dtc-list");
const messageArea = document.getElementById("message-area");
const msgTitle = document.getElementById("msg-title");
const msgBody = document.getElementById("msg-body");
const snapshotArea = document.getElementById("snapshot-area");
const compareArea = document.getElementById("compare-area");
const scenarioToggle = document.getElementById("scenario-toggle");
const scenarioMenu = document.getElementById("scenario-menu");
const footerSource = document.getElementById("footer-source");
const footerDevices = document.getElementById("footer-devices");
const deviceChips = document.getElementById("device-chips");
const simBadge = document.getElementById("sim-badge");
const footer = document.getElementById("footer");

// ── WebSocket ──────────────────────────────────────────

function connect() {
  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    reconnectDelay = 1000;
    statusDot.className = "status-dot connected";
    if (apiKey) send("auth", { key: apiKey });
    send("device.register", { deviceType: "customer", name: "viewer-display" });
    clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(() => {
      send("device.heartbeat", { uptimeMs: performance.now() | 0 });
    }, HEARTBEAT_INTERVAL);
    // Request current state
    send("devices.list", {});
    loadScenarios();
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      handleMessage(msg);
    } catch {}
  };

  ws.onclose = () => {
    statusDot.className = "status-dot disconnected";
    clearInterval(heartbeatTimer);
    setTimeout(connect, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, 30000);
  };

  ws.onerror = () => {};
}

// UUID fallback for older browsers (Midori/WebKit)
function uuid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0;
    return (c === "x" ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function send(type, payload) {
  try {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ id: uuid(), type: type, payload: payload, timestamp: Date.now() }));
    }
  } catch (e) {
    console.error("[ws] send error:", e);
  }
}

// ── Message Handler ────────────────────────────────────

function handleMessage(msg) {
  switch (msg.type) {
    case "obd.data":
      renderLiveData(msg.payload);
      break;

    case "obd.status":
      obdConnected = msg.payload?.connected;
      if (obdConnected) {
        liveStrip.style.display = "";
        footerSource.textContent = `Source: ${msg.payload.device || msg.payload.source || "OBD"}`;
      } else {
        liveStrip.style.display = "none";
        footerSource.textContent = "No connection";
      }
      break;

    case "snapshot.saved":
      renderSnapshot(msg.payload);
      break;

    case "snapshot.compare":
      renderComparison(msg.payload);
      break;

    case "mode.change":
      if (msg.payload?.mode) {
        currentMode = msg.payload.mode;
        modeLabel.textContent = currentMode.toUpperCase();
      }
      break;

    case "sim.scenarios":
      renderScenarios(msg.payload);
      break;

    case "devices.list":
      renderDevices(msg.payload);
      break;

    case "customer.status":
      if (msg.payload?.connectedDevices !== undefined) {
        footerDevices.textContent = `${msg.payload.connectedDevices} device${msg.payload.connectedDevices !== 1 ? "s" : ""}`;
      }
      break;

    case "device.register":
      break;

    case "error":
      console.warn("[crew-chief]", msg.payload?.message);
      break;
  }
}

// ── Device Rendering ──────────────────────────────────

function renderDevices(data) {
  const devices = data?.devices || [];
  const simOn = data?.simConnected || false;

  // Update device chips
  if (devices.length === 0) {
    deviceChips.innerHTML = '<span class="device-chip offline">No devices</span>';
  } else {
    deviceChips.innerHTML = devices.map(d => {
      const cls = d.deviceType === "technician" ? "tech" : d.deviceType === "customer" ? "customer" : "tech";
      const label = d.name === "unknown" ? d.deviceType : d.name;
      return `<span class="device-chip ${cls}">${label}</span>`;
    }).join("");
  }

  // Update sim badge
  simBadge.style.display = simOn ? "" : "none";

  // Update footer device count
  footerDevices.textContent = `${devices.length} device${devices.length !== 1 ? "s" : ""}`;
}

// ── Live Data Rendering ────────────────────────────────

function renderLiveData(data) {
  if (!data) return;
  liveStrip.style.display = "";

  setText("lv-rpm", Math.round(data.rpm));
  setText("lv-coolant", `${Math.round(data.coolantTemp)}°`);
  setText("lv-load", `${Math.round(data.engineLoad)}%`);
  setText("lv-throttle", `${Math.round(data.throttlePos)}%`);
  setText("lv-timing", `${data.timingAdvance?.toFixed(1)}°`);

  const dtcs = data.dtcs || [];
  if (dtcs.length > 0) {
    liveDtcs.style.display = "";
    liveDtcList.textContent = dtcs.join(" ");
  } else {
    liveDtcs.style.display = "none";
  }
}

// ── Snapshot Rendering ─────────────────────────────────

function renderSnapshot(snap) {
  messageArea.style.display = "none";
  compareArea.style.display = "none";
  snapshotArea.style.display = "";

  const typeEl = document.getElementById("snap-type");
  const timeEl = document.getElementById("snap-time");
  const vehicleEl = document.getElementById("snap-vehicle");
  const summaryEl = document.getElementById("snap-summary");

  typeEl.textContent = snap.readingType.replace("-", " ").toUpperCase();
  timeEl.textContent = new Date(snap.timestamp).toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
  vehicleEl.textContent = snap.vehicleLabel || "";

  if (currentMode === "shop") {
    summaryEl.innerHTML = buildCustomerSummary(snap);
  } else {
    summaryEl.innerHTML = buildTechSummary(snap);
  }
}

function buildCustomerSummary(snap) {
  if (snap.inputMethod === "obd") {
    const dtcCount = (snap.dtcs || []).length;
    let html = "<ul>";
    if (dtcCount > 0) {
      html += `<li>Your vehicle's computer found ${dtcCount} item${dtcCount > 1 ? "s" : ""} that need attention</li>`;
    } else {
      html += "<li>No warning codes detected</li>";
    }
    html += `<li>Engine temperature: ${snap.coolantTemp > 100 ? "Running warm" : "Normal"}</li>`;
    html += `<li>Engine is ${snap.engineLoad > 50 ? "working hard" : "running smoothly"}</li>`;
    html += "</ul>";
    return html;
  } else {
    let html = "<ul>";
    html += `<li>Engine temperature: ${snap.coolantTemp}°F</li>`;
    html += `<li>Oil pressure: ${snap.oilPressure} PSI</li>`;
    if (snap.compression?.length) {
      const avg = snap.compression.reduce((a, b) => a + b, 0) / snap.compression.length;
      html += `<li>Average compression: ${Math.round(avg)} PSI</li>`;
    }
    html += "</ul>";
    return html;
  }
}

function buildTechSummary(snap) {
  if (snap.inputMethod === "obd") {
    let html = "<ul>";
    html += `<li>RPM: ${Math.round(snap.rpm)} | Load: ${Math.round(snap.engineLoad)}%</li>`;
    html += `<li>Coolant: ${Math.round(snap.coolantTemp)}°C | Timing: ${snap.timingAdvance?.toFixed(1)}°</li>`;
    html += `<li>LTFT B1: ${snap.ltftB1?.toFixed(1)}% | LTFT B2: ${snap.ltftB2?.toFixed(1)}%</li>`;
    const dtcs = snap.dtcs || [];
    if (dtcs.length > 0) html += `<li style="color:var(--danger)">DTCs: ${dtcs.join(", ")}</li>`;
    else html += `<li style="color:var(--success)">No DTCs</li>`;
    html += "</ul>";
    return html;
  } else {
    let html = "<ul>";
    html += `<li>Jets: ${snap.primaryJets || "--"} / ${snap.secondaryJets || "--"} | Timing: ${snap.initialTiming || "--"}°</li>`;
    html += `<li>RPM: ${snap.rpm} | Vacuum: ${snap.manifoldVacuum}" | Oil: ${snap.oilPressure} PSI</li>`;
    if (snap.compression?.length) {
      html += `<li>Compression: ${snap.compression.join(", ")}</li>`;
    }
    if (snap.plugCondition?.length) {
      html += `<li>Plugs: ${snap.plugCondition.join(", ")}</li>`;
    }
    html += "</ul>";
    return html;
  }
}

// ── Comparison Rendering ───────────────────────────────

function renderComparison(comparison) {
  messageArea.style.display = "none";
  snapshotArea.style.display = "none";
  compareArea.style.display = "";

  const changesEl = document.getElementById("compare-changes");
  const summaryEl = document.getElementById("compare-summary");

  let html = `<div class="cmp-row header-row">
    <span>Parameter</span><span style="text-align:center">Before</span>
    <span style="text-align:center">After</span><span style="text-align:center">Delta</span>
    <span style="text-align:center">Status</span>
  </div>`;

  for (const c of comparison.changes || []) {
    const delta = c.delta !== undefined ? (c.delta > 0 ? `+${c.delta}` : c.delta) : "--";
    html += `<div class="cmp-row">
      <span class="cmp-label">${c.label}</span>
      <span class="cmp-before">${c.before}</span>
      <span class="cmp-after">${c.after}</span>
      <span class="cmp-delta sev-${c.severity}">${delta} ${c.unit}</span>
      <span class="cmp-sev sev-${c.severity}">${c.severity}</span>
    </div>`;
  }

  changesEl.innerHTML = html;
  summaryEl.textContent = comparison.summary || "";
}

// ── Scenario Picker ────────────────────────────────────

function loadScenarios() {
  send("sim.scenarios", {});
}

function renderScenarios(data) {
  const scenarios = data?.scenarios || [];
  if (scenarios.length === 0) {
    scenarioToggle.textContent = data?.error || "No scenarios";
    scenarioMenu.innerHTML = "";
    return;
  }
  const active = scenarios.find(s => s.active);
  scenarioToggle.textContent = active ? active.name : scenarios[0].name;
  scenarioMenu.innerHTML = scenarios.map(s =>
    `<div class="scenario-menu-item${s.active ? " active" : ""}" data-key="${s.key}">${s.name}</div>`
  ).join("");
}

// Position dropdown above the toggle button using fixed positioning
function positionDropdown() {
  const rect = scenarioToggle.getBoundingClientRect();
  scenarioMenu.style.left = rect.left + "px";
  scenarioMenu.style.bottom = (window.innerHeight - rect.top + 4) + "px";
  scenarioMenu.style.minWidth = Math.max(220, rect.width) + "px";
}

scenarioToggle.addEventListener("click", (e) => {
  e.stopPropagation();
  if (scenarioMenu.classList.contains("open")) {
    scenarioMenu.classList.remove("open");
  } else {
    positionDropdown();
    scenarioMenu.classList.add("open");
  }
});

scenarioMenu.addEventListener("click", (e) => {
  const item = e.target.closest(".scenario-menu-item");
  if (!item) return;
  scenarioToggle.textContent = item.textContent;
  scenarioMenu.classList.remove("open");
  send("sim.select", { scenario: item.dataset.key });
});

document.addEventListener("click", () => {
  scenarioMenu.classList.remove("open");
});

// ── Helpers ────────────────────────────────────────────

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

// ── Boot ──────────────────────────────────────────────

connect();
