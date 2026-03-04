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

  it("auto-truncates content to fit slot maxTokens on update", () => {
    const engine = new CWOPEngine({
      totalBudget: 200,
      overflowStrategy: "truncate",
      slots: [{ name: "small", category: "auto", priority: "high", maxTokens: 10, source: "test" }],
    });
    // Feed a large string (~500 tokens) into a 10-token slot
    const hugeContent = "This is a very long piece of text. ".repeat(50);
    engine.updateSlot("small", hugeContent);
    const slot = engine.slots.get("small")!;
    // Token estimate should be at or below maxTokens after truncation
    expect(slot.tokenEstimate).toBeLessThanOrEqual(slot.maxTokens);
    // Content should be shorter than original
    expect(slot.content.length).toBeLessThan(hugeContent.length);
    // Content should include truncation marker
    expect(slot.content).toContain("[...truncated]");
  });

  it("does not truncate content that fits within budget", () => {
    const engine = new CWOPEngine({
      totalBudget: 1000,
      overflowStrategy: "truncate",
      slots: [{ name: "spacious", category: "auto", priority: "high", maxTokens: 500, source: "test" }],
    });
    const shortContent = "Hello, world!";
    engine.updateSlot("spacious", shortContent);
    const slot = engine.slots.get("spacious")!;
    expect(slot.content).toBe(shortContent);
    expect(slot.content).not.toContain("[...truncated");
  });

  it("widget status never reports tokens exceeding max", () => {
    const engine = new CWOPEngine(CODE_BUILDER_PRESET);
    // Fill every slot with huge content
    for (const slotDef of CODE_BUILDER_PRESET.slots) {
      engine.updateSlot(slotDef.name, "x".repeat(10000));
    }
    const status = engine.getBudgetStatus();
    for (const slotStatus of status.slots) {
      expect(slotStatus.tokens).toBeLessThanOrEqual(slotStatus.max);
      expect(slotStatus.utilization).toBeLessThanOrEqual(100);
    }
  });

  it("records truncation in audit trail", () => {
    const engine = new CWOPEngine({
      totalBudget: 200,
      overflowStrategy: "truncate",
      slots: [{ name: "audited", category: "auto", priority: "high", maxTokens: 10, source: "test" }],
    });
    engine.updateSlot("audited", "word ".repeat(200));
    expect(engine.audit.length).toBeGreaterThan(0);
    const lastEntry = engine.audit[engine.audit.length - 1];
    expect(lastEntry.slotName).toBe("audited");
    expect(lastEntry.action).toBe("update");
    expect(lastEntry.tokensAfter).toBeLessThanOrEqual(10);
  });

  it("evicts expired slots based on TTL", () => {
    const engine = new CWOPEngine({
      totalBudget: 200,
      overflowStrategy: "truncate",
      slots: [{ name: "ephemeral", category: "auto", priority: "low", maxTokens: 100, source: "test", ttlMs: 1 }],
    });
    engine.updateSlot("ephemeral", "temporary data");
    // Slot should be active right after update
    expect(engine.slots.get("ephemeral")!.isActive).toBe(true);
    // Wait for TTL to expire (1ms)
    const start = Date.now();
    while (Date.now() - start < 5) { /* spin */ }
    const evicted = engine.evictExpired();
    expect(evicted).toContain("ephemeral");
    expect(engine.slots.get("ephemeral")!.isActive).toBe(false);
  });
});
