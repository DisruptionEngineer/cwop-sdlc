import { WSClient } from "./ws-client.js";
import { State } from "./state.js";

const ws = new WSClient();
const state = new State({
  connected: false,
  extensions: [],
  ollamaHealthy: false,
  ollamaModels: [],
  activeExtension: "code-builder",
  messages: [],
  streaming: false,
  cwopStatus: null,
});

// DOM refs
const statusDot = document.getElementById("status-dot");
const statusText = document.getElementById("status-text");
const modelCount = document.getElementById("model-count");
const extensionCards = document.getElementById("extension-cards");
const cwopSlots = document.getElementById("cwop-slots");
const cwopMeter = document.getElementById("cwop-meter");
const cwopPct = document.getElementById("cwop-pct");
const chatMessages = document.getElementById("chat-messages");
const chatInput = document.getElementById("chat-input");
const sendBtn = document.getElementById("send-btn");
const extTabs = document.getElementById("ext-tabs");

// WebSocket handlers
ws.on("connected", () => {
  state.set("connected", true);
  ws.send("extension.list");
  ws.send("model.health");
  ws.send("cwop.status", { extensionId: state.get("activeExtension") });
});

ws.on("disconnected", () => state.set("connected", false));

ws.on("extension.list", (extensions) => {
  state.set("extensions", extensions);
});

ws.on("model.health", (health) => {
  state.set("ollamaHealthy", health.healthy);
  state.set("ollamaModels", health.models || []);
});

ws.on("cwop.update", (data) => {
  if (data.extensionId === state.get("activeExtension")) {
    state.set("cwopStatus", data.status);
  }
});

ws.on("chat.stream_chunk", (chunk) => {
  if (chunk.done) {
    state.set("streaming", false);
    return;
  }
  state.update("messages", (msgs) => {
    const last = msgs[msgs.length - 1];
    if (last && last.role === "assistant") {
      last.content += chunk.delta;
      return [...msgs];
    }
    return [...msgs, { role: "assistant", content: chunk.delta }];
  });
  scrollChat();
});

ws.on("chat.done", (data) => {
  state.set("streaming", false);
  if (data.cwopStatus) {
    state.set("cwopStatus", data.cwopStatus);
  }
});

ws.on("error", (err) => {
  console.error("[gateway error]", err);
  state.set("streaming", false);
});

// State reactivity
state.on("connected", (connected) => {
  statusDot.className = `status-dot ${connected ? "healthy" : "unhealthy"}`;
  statusText.textContent = connected ? "Connected" : "Disconnected";
});

state.on("ollamaHealthy", (healthy) => {
  const dot = document.getElementById("ollama-dot");
  if (dot) dot.className = `status-dot ${healthy ? "healthy" : "unhealthy"}`;
});

state.on("ollamaModels", (models) => {
  modelCount.textContent = `${models.length} models`;
});

state.on("extensions", (extensions) => {
  renderExtensions(extensions);
  renderExtTabs(extensions);
});

state.on("cwopStatus", (status) => {
  if (status) renderCWOP(status);
});

state.on("messages", () => renderMessages());
state.on("streaming", (s) => {
  sendBtn.disabled = s;
  sendBtn.textContent = s ? "..." : "Send";
});

// Render functions
function renderExtensions(extensions) {
  extensionCards.innerHTML = extensions.map(ext => `
    <div class="card" style="cursor:pointer" data-ext="${ext.id}">
      <div class="card-header">
        <h3>${ext.name}</h3>
        <span class="status-dot ${ext.active ? "healthy" : "unknown"}"></span>
      </div>
      <p style="font-size:12px;color:var(--text-secondary)">${ext.description}</p>
      <p style="font-size:11px;color:var(--text-muted);margin-top:4px;font-family:var(--font-mono)">${ext.model}</p>
    </div>
  `).join("");
}

function renderExtTabs(extensions) {
  extTabs.innerHTML = extensions.map(ext => `
    <button class="ext-tab ${ext.id === state.get("activeExtension") ? "active" : ""}" data-ext="${ext.id}">
      ${ext.name}
    </button>
  `).join("");
}

function renderCWOP(status) {
  const pct = status.utilizationPct;
  cwopMeter.querySelector(".meter-fill").style.width = `${pct}%`;
  cwopMeter.querySelector(".meter-fill").className = `meter-fill ${pct > 90 ? "high" : pct > 70 ? "medium" : "low"}`;
  cwopPct.textContent = `${status.used}/${status.totalBudget} tokens (${pct}%)`;

  cwopSlots.innerHTML = status.slots.map(slot => `
    <li class="slot-item">
      <span class="${slot.active ? "active" : "inactive"}">${slot.active ? "●" : "○"}</span>
      <span>${slot.name}</span>
      <div class="meter" style="width:80px">
        <div class="meter-fill ${slot.utilization > 90 ? "high" : slot.utilization > 70 ? "medium" : "low"}"
             style="width:${slot.utilization}%"></div>
      </div>
      <span>${slot.tokens}/${slot.max}</span>
    </li>
  `).join("");
}

function renderMessages() {
  const msgs = state.get("messages");
  chatMessages.innerHTML = msgs.map(msg => `
    <div class="message ${msg.role}">
      ${escapeHtml(msg.content)}
    </div>
  `).join("");
}

function scrollChat() {
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// Event listeners
sendBtn.addEventListener("click", sendMessage);
chatInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

extTabs.addEventListener("click", (e) => {
  const tab = e.target.closest("[data-ext]");
  if (tab) {
    state.set("activeExtension", tab.dataset.ext);
    state.set("messages", []);
    renderExtTabs(state.get("extensions"));
    ws.send("cwop.status", { extensionId: tab.dataset.ext });
  }
});

function sendMessage() {
  const message = chatInput.value.trim();
  if (!message || state.get("streaming")) return;

  state.update("messages", (msgs) => [...msgs, { role: "user", content: message }]);
  state.set("streaming", true);
  chatInput.value = "";

  ws.send("chat.send", {
    extensionId: state.get("activeExtension"),
    message,
  });
  scrollChat();
}

// Boot
ws.connect();

// Refresh CWOP status periodically
setInterval(() => {
  if (state.get("connected")) {
    ws.send("cwop.status", { extensionId: state.get("activeExtension") });
    ws.send("model.health");
  }
}, 10000);
