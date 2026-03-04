import { describe, it, expect } from "bun:test";
import { CWOPEngine } from "../../src/cwop/engine.js";
import type { CWOPConfig } from "../../src/types/cwop.js";

function makeConfig(overrides?: Partial<CWOPConfig>): CWOPConfig {
  return {
    totalBudget: 1000,
    overflowStrategy: "truncate",
    slots: [
      { name: "persistent", category: "static", priority: "critical", maxTokens: 200, source: "test" },
      { name: "ephemeral", category: "demand", priority: "medium", maxTokens: 200, source: "test", ttlMs: 100 },
      { name: "short_lived", category: "demand", priority: "low", maxTokens: 200, source: "test", ttlMs: 50 },
    ],
    ...overrides,
  };
}

// ─── TTL Eviction ──────────────────────────────────────────

describe("TTL Eviction", () => {
  it("does not evict slots within TTL", () => {
    const engine = new CWOPEngine(makeConfig());
    engine.updateSlot("ephemeral", "still fresh");
    const evicted = engine.evictExpired();
    expect(evicted).toEqual([]);
    expect(engine.slots.get("ephemeral")!.isActive).toBe(true);
  });

  it("evicts slots past their TTL", async () => {
    const engine = new CWOPEngine(makeConfig());
    engine.updateSlot("short_lived", "temporary data");

    // Wait for TTL to expire
    await new Promise(r => setTimeout(r, 60));

    const evicted = engine.evictExpired();
    expect(evicted).toContain("short_lived");
    expect(engine.slots.get("short_lived")!.content).toBe("");
    expect(engine.slots.get("short_lived")!.isActive).toBe(false);
  });

  it("does not evict slots without TTL", async () => {
    const engine = new CWOPEngine(makeConfig());
    engine.updateSlot("persistent", "should stay forever");

    await new Promise(r => setTimeout(r, 60));

    const evicted = engine.evictExpired();
    expect(evicted).not.toContain("persistent");
    expect(engine.slots.get("persistent")!.isActive).toBe(true);
  });

  it("evicts multiple expired slots at once", async () => {
    const engine = new CWOPEngine(makeConfig());
    engine.updateSlot("ephemeral", "data1");
    engine.updateSlot("short_lived", "data2");

    await new Promise(r => setTimeout(r, 110));

    const evicted = engine.evictExpired();
    expect(evicted).toContain("ephemeral");
    expect(evicted).toContain("short_lived");
  });

  it("tick() calls evictExpired", async () => {
    const engine = new CWOPEngine(makeConfig());
    engine.updateSlot("short_lived", "will expire");

    await new Promise(r => setTimeout(r, 60));

    const result = engine.tick();
    expect(result.evicted).toContain("short_lived");
  });

  it("assembleContext() evicts expired before assembly", async () => {
    const engine = new CWOPEngine(makeConfig());
    engine.updateSlot("persistent", "KEEP_THIS");
    engine.updateSlot("short_lived", "SHOULD_VANISH");

    await new Promise(r => setTimeout(r, 60));

    const context = engine.assembleContext();
    expect(context).toContain("KEEP_THIS");
    expect(context).not.toContain("SHOULD_VANISH");
  });

  it("budget status reflects eviction", async () => {
    const engine = new CWOPEngine(makeConfig());
    engine.updateSlot("ephemeral", "some data here for tokens");

    const before = engine.getBudgetStatus();
    expect(before.used).toBeGreaterThan(0);

    await new Promise(r => setTimeout(r, 110));

    engine.evictExpired();
    const after = engine.getBudgetStatus();
    expect(after.used).toBeLessThan(before.used);
  });
});

// ─── Audit Trail ───────────────────────────────────────────

describe("Audit Trail", () => {
  it("records slot updates", () => {
    const engine = new CWOPEngine(makeConfig());
    engine.updateSlot("persistent", "first");
    engine.updateSlot("persistent", "second");

    const trail = engine.auditForSlot("persistent");
    expect(trail.length).toBe(2);
    expect(trail[0].action).toBe("update");
    expect(trail[1].action).toBe("update");
    expect(trail[1].tokensBefore).toBeGreaterThan(0);
  });

  it("records slot clears", () => {
    const engine = new CWOPEngine(makeConfig());
    engine.updateSlot("persistent", "data");
    engine.clearSlot("persistent");

    const trail = engine.auditForSlot("persistent");
    const clearEntry = trail.find(e => e.action === "clear");
    expect(clearEntry).toBeDefined();
    expect(clearEntry!.tokensAfter).toBe(0);
    expect(clearEntry!.tokensBefore).toBeGreaterThan(0);
  });

  it("records dynamic slot creation", () => {
    const engine = new CWOPEngine(makeConfig());
    engine.updateSlot("brand_new", "hello");

    const trail = engine.auditForSlot("brand_new");
    expect(trail[0].action).toBe("create");
    expect(trail[1].action).toBe("update");
  });

  it("records TTL expirations", async () => {
    const engine = new CWOPEngine(makeConfig());
    engine.updateSlot("short_lived", "will expire");

    await new Promise(r => setTimeout(r, 60));
    engine.evictExpired();

    const trail = engine.auditForSlot("short_lived");
    const expireEntry = trail.find(e => e.action === "expire");
    expect(expireEntry).toBeDefined();
    expect(expireEntry!.tokensAfter).toBe(0);
  });

  it("stores content preview (truncated to 120 chars)", () => {
    const engine = new CWOPEngine(makeConfig());
    const longContent = "A".repeat(200);
    engine.updateSlot("persistent", longContent);

    const trail = engine.auditForSlot("persistent");
    expect(trail[0].contentPreview.length).toBeLessThanOrEqual(120);
  });

  it("respects audit max size (ring buffer)", () => {
    const engine = new CWOPEngine(makeConfig(), { auditMaxSize: 5 });

    for (let i = 0; i < 10; i++) {
      engine.updateSlot("persistent", `content ${i}`);
    }

    expect(engine.audit.length).toBe(5);
    // Should have the most recent entries
    expect(engine.audit[4].contentPreview).toContain("content 9");
  });

  it("clearAudit empties the trail", () => {
    const engine = new CWOPEngine(makeConfig());
    engine.updateSlot("persistent", "data");
    expect(engine.audit.length).toBeGreaterThan(0);
    engine.clearAudit();
    expect(engine.audit.length).toBe(0);
  });

  it("full audit returns all entries across slots", () => {
    const engine = new CWOPEngine(makeConfig());
    engine.updateSlot("persistent", "a");
    engine.updateSlot("ephemeral", "b");
    engine.clearSlot("persistent");

    expect(engine.audit.length).toBe(3);
  });
});
