import { describe, it, expect } from "bun:test";
import { CWOPEngine } from "../../src/cwop/engine.js";
import { CODE_BUILDER_PRESET } from "../../src/cwop/presets/code-builder.preset.js";

describe("CWOPEngine", () => {
  it("initializes with preset slots", () => {
    const engine = new CWOPEngine(CODE_BUILDER_PRESET);
    expect(engine.slots.size).toBe(CODE_BUILDER_PRESET.slots.length);
  });

  it("updates a slot and estimates tokens", () => {
    const engine = new CWOPEngine(CODE_BUILDER_PRESET);
    engine.updateSlot("system_persona", "You are a C# expert.");
    const slot = engine.slots.get("system_persona")!;
    expect(slot.content).toBe("You are a C# expert.");
    expect(slot.tokenEstimate).toBeGreaterThan(0);
    expect(slot.isActive).toBe(true);
  });

  it("clears a slot", () => {
    const engine = new CWOPEngine(CODE_BUILDER_PRESET);
    engine.updateSlot("system_persona", "content");
    engine.clearSlot("system_persona");
    const slot = engine.slots.get("system_persona")!;
    expect(slot.content).toBe("");
    expect(slot.isActive).toBe(false);
  });

  it("returns budget status", () => {
    const engine = new CWOPEngine(CODE_BUILDER_PRESET);
    engine.updateSlot("system_persona", "test content here");
    const status = engine.getBudgetStatus();
    expect(status.totalBudget).toBe(6000);
    expect(status.used).toBeGreaterThan(0);
    expect(status.available).toBeLessThan(6000);
    expect(status.slots.length).toBe(CODE_BUILDER_PRESET.slots.length);
  });

  it("assembles context from active slots only", () => {
    const engine = new CWOPEngine(CODE_BUILDER_PRESET);
    engine.updateSlot("system_persona", "Persona content");
    engine.updateSlot("tech_stack", "C# 12, .NET 8");
    const context = engine.assembleContext();
    expect(context).toContain("Persona content");
    expect(context).toContain("C# 12, .NET 8");
  });

  it("auto-creates demand slots for unknown names", () => {
    const engine = new CWOPEngine(CODE_BUILDER_PRESET);
    engine.updateSlot("custom_slot", "custom content");
    expect(engine.slots.has("custom_slot")).toBe(true);
    expect(engine.slots.get("custom_slot")!.category).toBe("demand");
  });

  it("reports correct utilization percentages", () => {
    const engine = new CWOPEngine({
      totalBudget: 100,
      overflowStrategy: "truncate",
      slots: [{ name: "test", category: "auto", priority: "high", maxTokens: 50, source: "test" }],
    });
    // ~20 chars = ~5 tokens
    engine.updateSlot("test", "short text");
    const status = engine.getBudgetStatus();
    expect(status.utilizationPct).toBeGreaterThan(0);
    expect(status.utilizationPct).toBeLessThan(100);
  });
});
