/**
 * WebSocket connection manager for the CWOP Gateway
 */
export class WSClient {
  constructor(url = `ws://${location.host}/ws`) {
    this.url = url;
    this.ws = null;
    this.handlers = new Map();
    this.reconnectDelay = 1000;
    this.maxReconnectDelay = 30000;
    this.pendingRequests = new Map();
  }

  connect() {
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      console.log("[ws] Connected");
      this.reconnectDelay = 1000;
      this.emit("connected");
    };

    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      this.emit(msg.type, msg.payload, msg.id);

      // Resolve pending request if this is a response
      const pending = this.pendingRequests.get(msg.id);
      if (pending) {
        pending.resolve(msg.payload);
        this.pendingRequests.delete(msg.id);
      }
    };

    this.ws.onclose = () => {
      console.log("[ws] Disconnected, reconnecting...");
      this.emit("disconnected");
      setTimeout(() => this.connect(), this.reconnectDelay);
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
    };

    this.ws.onerror = (err) => {
      console.error("[ws] Error:", err);
    };
  }

  send(type, payload = {}) {
    const id = crypto.randomUUID();
    const msg = { id, type, payload, timestamp: Date.now() };
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
    return id;
  }

  request(type, payload = {}) {
    return new Promise((resolve, reject) => {
      const id = this.send(type, payload);
      this.pendingRequests.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error("Request timeout"));
        }
      }, 30000);
    });
  }

  on(event, handler) {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event).add(handler);
  }

  off(event, handler) {
    this.handlers.get(event)?.delete(handler);
  }

  emit(event, ...args) {
    for (const handler of this.handlers.get(event) ?? []) {
      handler(...args);
    }
  }
}
