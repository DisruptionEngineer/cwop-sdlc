/**
 * Lightweight reactive state management (no framework)
 */
export class State {
  constructor(initial = {}) {
    this.data = { ...initial };
    this.listeners = new Map();
  }

  get(key) {
    return this.data[key];
  }

  set(key, value) {
    const prev = this.data[key];
    this.data[key] = value;
    if (prev !== value) {
      this.notify(key, value, prev);
    }
  }

  update(key, fn) {
    const prev = this.data[key];
    this.data[key] = fn(prev);
    this.notify(key, this.data[key], prev);
  }

  on(key, handler) {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    this.listeners.get(key).add(handler);
    return () => this.listeners.get(key)?.delete(handler);
  }

  notify(key, value, prev) {
    for (const handler of this.listeners.get(key) ?? []) {
      handler(value, prev);
    }
    for (const handler of this.listeners.get("*") ?? []) {
      handler(key, value, prev);
    }
  }
}
