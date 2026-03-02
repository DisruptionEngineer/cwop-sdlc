import type { ContextSlot, SlotCategory, SlotPriority, SlotStatus } from "../types/cwop.js";

export class CWOPSlot implements ContextSlot {
  name: string;
  category: SlotCategory;
  priority: SlotPriority;
  content: string = "";
  tokenEstimate: number = 0;
  maxTokens: number;
  lastUpdated: number = 0;
  source: string;
  ttlMs?: number;

  constructor(def: { name: string; category: SlotCategory; priority: SlotPriority; maxTokens: number; source: string; ttlMs?: number }) {
    this.name = def.name;
    this.category = def.category;
    this.priority = def.priority;
    this.maxTokens = def.maxTokens;
    this.source = def.source;
    this.ttlMs = def.ttlMs;
  }

  get utilization(): number {
    if (this.maxTokens === 0) return 0;
    return Math.min(1.0, this.tokenEstimate / this.maxTokens);
  }

  get isExpired(): boolean {
    if (!this.ttlMs || !this.lastUpdated) return false;
    return Date.now() - this.lastUpdated > this.ttlMs;
  }

  get isActive(): boolean {
    return this.content.length > 0 && !this.isExpired;
  }

  toStatus(): SlotStatus {
    return {
      name: this.name,
      source: this.source,
      tokens: this.tokenEstimate,
      max: this.maxTokens,
      utilization: Math.round(this.utilization * 100),
      category: this.category,
      priority: this.priority,
      active: this.isActive,
      expired: this.isExpired,
    };
  }
}
