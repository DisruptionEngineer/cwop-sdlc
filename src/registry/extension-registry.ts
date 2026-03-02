import type { ExtensionRegistration } from "../types/extensions.js";
import type { BudgetStatus } from "../types/cwop.js";
import { CWOPEngine } from "../cwop/engine.js";
import { EventBus } from "./event-bus.js";

interface ExtensionState {
  registration: ExtensionRegistration;
  active: boolean;
  currentModel: string;
  cwopEngine: CWOPEngine;
  lastActivity: number;
}

export class ExtensionRegistry {
  private extensions = new Map<string, ExtensionState>();
  readonly events = new EventBus();

  register(reg: ExtensionRegistration): void {
    this.extensions.set(reg.id, {
      registration: reg,
      active: true,
      currentModel: reg.defaultModel,
      cwopEngine: new CWOPEngine(reg.cwopPreset),
      lastActivity: Date.now(),
    });
    this.events.emit("extension:registered", reg.id);
  }

  getEngine(extensionId: string): CWOPEngine | null {
    return this.extensions.get(extensionId)?.cwopEngine ?? null;
  }

  getBudgetStatus(extensionId: string): BudgetStatus | null {
    return this.extensions.get(extensionId)?.cwopEngine.getBudgetStatus() ?? null;
  }

  getModel(extensionId: string): string | null {
    return this.extensions.get(extensionId)?.currentModel ?? null;
  }

  listExtensions(): Array<{ id: string; name: string; description: string; active: boolean; model: string }> {
    return [...this.extensions.values()].map(ext => ({
      id: ext.registration.id,
      name: ext.registration.name,
      description: ext.registration.description,
      active: ext.active,
      model: ext.currentModel,
    }));
  }

  updateActivity(extensionId: string): void {
    const ext = this.extensions.get(extensionId);
    if (ext) ext.lastActivity = Date.now();
  }
}
