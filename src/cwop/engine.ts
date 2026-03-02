import type { BudgetStatus, CWOPConfig, SlotDefinition } from "../types/cwop.js";
import { CWOPSlot } from "./slot.js";
import { estimateTokens } from "./tokenizer.js";
import { assembleContext } from "./assembler.js";

export class CWOPEngine {
  private readonly config: CWOPConfig;
  readonly slots = new Map<string, CWOPSlot>();

  constructor(config: CWOPConfig) {
    this.config = config;
    for (const def of config.slots) {
      this.slots.set(def.name, new CWOPSlot(def));
    }
  }

  updateSlot(name: string, content: string): void {
    let slot = this.slots.get(name);
    if (!slot) {
      slot = new CWOPSlot({
        name,
        category: "demand",
        priority: "low",
        maxTokens: 500,
        source: "dynamic",
      });
      this.slots.set(name, slot);
    }
    slot.content = content;
    slot.tokenEstimate = estimateTokens(content);
    slot.lastUpdated = Date.now();
  }

  clearSlot(name: string): void {
    const slot = this.slots.get(name);
    if (slot) {
      slot.content = "";
      slot.tokenEstimate = 0;
    }
  }

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

  get totalBudget(): number {
    return this.config.totalBudget;
  }
}
