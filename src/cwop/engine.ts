import type { BudgetStatus, CWOPConfig, SlotDefinition } from "../types/cwop.js";
import { CWOPSlot } from "./slot.js";
import { estimateTokens, truncateToTokens } from "./tokenizer.js";
import { assembleContext } from "./assembler.js";

/** A single entry in the slot audit trail. */
export interface SlotAuditEntry {
  timestamp: number;
  slotName: string;
  action: "update" | "clear" | "expire" | "create";
  tokensBefore: number;
  tokensAfter: number;
  contentPreview: string;
}

export class CWOPEngine {
  private readonly config: CWOPConfig;
  readonly slots = new Map<string, CWOPSlot>();

  /** Audit trail — bounded ring buffer of recent slot mutations. */
  private readonly _audit: SlotAuditEntry[] = [];
  private readonly _auditMaxSize: number;

  constructor(config: CWOPConfig, opts?: { auditMaxSize?: number }) {
    this.config = config;
    this._auditMaxSize = opts?.auditMaxSize ?? 200;
    for (const def of config.slots) {
      this.slots.set(def.name, new CWOPSlot(def));
    }
  }

  // ─── Slot Mutations ──────────────────────────────────────────

  updateSlot(name: string, content: string): void {
    let slot = this.slots.get(name);
    const tokensBefore = slot?.tokenEstimate ?? 0;

    if (!slot) {
      slot = new CWOPSlot({
        name,
        category: "demand",
        priority: "low",
        maxTokens: 500,
        source: "dynamic",
      });
      this.slots.set(name, slot);
      this._pushAudit(name, "create", 0, 0, "");
    }

    // Auto-truncate content to fit the slot's token budget
    const fitted = truncateToTokens(content, slot.maxTokens);
    slot.content = fitted;
    slot.tokenEstimate = estimateTokens(fitted);
    slot.lastUpdated = Date.now();

    this._pushAudit(name, "update", tokensBefore, slot.tokenEstimate, fitted);
  }

  clearSlot(name: string): void {
    const slot = this.slots.get(name);
    if (slot) {
      const tokensBefore = slot.tokenEstimate;
      slot.content = "";
      slot.tokenEstimate = 0;
      this._pushAudit(name, "clear", tokensBefore, 0, "");
    }
  }

  // ─── TTL Eviction ────────────────────────────────────────────

  /**
   * Evict all expired slots (clear their content).
   * Returns the names of slots that were evicted.
   */
  evictExpired(): string[] {
    const evicted: string[] = [];
    for (const [name, slot] of this.slots) {
      if (slot.content.length > 0 && slot.isExpired) {
        const tokensBefore = slot.tokenEstimate;
        slot.content = "";
        slot.tokenEstimate = 0;
        evicted.push(name);
        this._pushAudit(name, "expire", tokensBefore, 0, "");
      }
    }
    return evicted;
  }

  /**
   * Engine tick — run periodic maintenance (TTL eviction, etc.).
   * Call this on an interval or before each context assembly.
   * Returns summary of actions taken.
   */
  tick(): { evicted: string[] } {
    const evicted = this.evictExpired();
    return { evicted };
  }

  // ─── Budget & Assembly ───────────────────────────────────────

  getBudgetStatus(): BudgetStatus {
    const allSlots = [...this.slots.values()];
    const used = allSlots.filter(s => s.isActive).reduce((sum, s) => sum + s.tokenEstimate, 0);
    return {
      totalBudget: this.config.totalBudget,
      used,
      available: this.config.totalBudget - used,
      utilizationPct: this.config.totalBudget > 0
        ? Math.round((used / this.config.totalBudget) * 100)
        : 0,
      slots: allSlots.map(s => s.toStatus()),
      assembledAt: Date.now(),
    };
  }

  assembleContext(): string {
    // Run TTL eviction before assembly to ensure fresh context
    this.evictExpired();
    return assembleContext(
      [...this.slots.values()],
      this.config.totalBudget,
      this.config.overflowStrategy,
    );
  }

  addSlot(def: SlotDefinition): void {
    if (!this.slots.has(def.name)) {
      this.slots.set(def.name, new CWOPSlot(def));
    }
  }

  // ─── Audit Trail ─────────────────────────────────────────────

  /** Get the full audit trail (newest last). */
  get audit(): ReadonlyArray<SlotAuditEntry> {
    return this._audit;
  }

  /** Get audit entries for a specific slot. */
  auditForSlot(name: string): SlotAuditEntry[] {
    return this._audit.filter(e => e.slotName === name);
  }

  /** Clear the audit trail. */
  clearAudit(): void {
    this._audit.length = 0;
  }

  get totalBudget(): number {
    return this.config.totalBudget;
  }

  // ─── Internal ────────────────────────────────────────────────

  private _pushAudit(
    slotName: string,
    action: SlotAuditEntry["action"],
    tokensBefore: number,
    tokensAfter: number,
    content: string,
  ): void {
    this._audit.push({
      timestamp: Date.now(),
      slotName,
      action,
      tokensBefore,
      tokensAfter,
      contentPreview: content.slice(0, 120),
    });
    // Ring buffer — drop oldest when exceeding max
    while (this._audit.length > this._auditMaxSize) {
      this._audit.shift();
    }
  }
}
