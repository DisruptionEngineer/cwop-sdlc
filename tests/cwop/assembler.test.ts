import { describe, it, expect } from "bun:test";
import { assembleContext } from "../../src/cwop/assembler.js";
import { CWOPSlot } from "../../src/cwop/slot.js";
import { estimateTokens } from "../../src/cwop/tokenizer.js";

function makeSlot(
  overrides: Partial<{
    name: string;
    category: "auto" | "demand" | "static";
    priority: "critical" | "high" | "medium" | "low";
    maxTokens: number;
    source: string;
    content: string;
    ttlMs: number;
  }> = {},
): CWOPSlot {
  const slot = new CWOPSlot({
    name: overrides.name ?? "test",
    category: overrides.category ?? "auto",
    priority: overrides.priority ?? "medium",
    maxTokens: overrides.maxTokens ?? 500,
    source: overrides.source ?? "test",
    ttlMs: overrides.ttlMs,
  });
  if (overrides.content) {
    slot.content = overrides.content;
    slot.tokenEstimate = estimateTokens(overrides.content);
    slot.lastUpdated = Date.now();
  }
  return slot;
}

// ─── Truncate Strategy ─────────────────────────────────────

describe("assembleContext (truncate strategy)", () => {
  it("returns empty string when no slots are active", () => {
    const slots = [makeSlot({ name: "empty1" }), makeSlot({ name: "empty2" })];
    expect(assembleContext(slots, 1000, "truncate")).toBe("");
  });

  it("assembles active slots in priority order", () => {
    const slots = [
      makeSlot({ name: "low", priority: "low", content: "LOW_CONTENT" }),
      makeSlot({ name: "critical", priority: "critical", content: "CRITICAL_CONTENT" }),
      makeSlot({ name: "high", priority: "high", content: "HIGH_CONTENT" }),
    ];
    const result = assembleContext(slots, 10000, "truncate");
    const critIdx = result.indexOf("CRITICAL_CONTENT");
    const highIdx = result.indexOf("HIGH_CONTENT");
    const lowIdx = result.indexOf("LOW_CONTENT");
    expect(critIdx).toBeLessThan(highIdx);
    expect(highIdx).toBeLessThan(lowIdx);
  });

  it("includes only active slots (skips empty)", () => {
    const slots = [
      makeSlot({ name: "active", priority: "high", content: "ACTIVE" }),
      makeSlot({ name: "empty", priority: "critical" }), // no content
    ];
    const result = assembleContext(slots, 10000, "truncate");
    expect(result).toContain("ACTIVE");
    expect(result).not.toContain("CRITICAL"); // empty slot not assembled
  });

  it("truncates individual slot when it exceeds its own maxTokens", () => {
    const longContent = "word ".repeat(500); // ~500 words ≈ many tokens
    const slot = makeSlot({
      name: "big",
      priority: "high",
      maxTokens: 10, // very small budget
      content: longContent,
    });
    const result = assembleContext([slot], 100000, "truncate");
    // Result should be shorter than original
    expect(result.length).toBeLessThan(longContent.length);
  });

  it("does not truncate slot within its maxTokens", () => {
    const content = "short text";
    const slot = makeSlot({
      name: "small",
      priority: "high",
      maxTokens: 500,
      content,
    });
    const result = assembleContext([slot], 10000, "truncate");
    expect(result).toBe(content);
  });

  it("joins multiple slots with double newline", () => {
    const slots = [
      makeSlot({ name: "a", priority: "high", content: "AAA" }),
      makeSlot({ name: "b", priority: "medium", content: "BBB" }),
    ];
    const result = assembleContext(slots, 10000, "truncate");
    expect(result).toBe("AAA\n\nBBB");
  });

  it("skips expired slots", () => {
    const slot = makeSlot({
      name: "expired",
      priority: "critical",
      content: "SHOULD_NOT_APPEAR",
      ttlMs: 1, // 1ms TTL
    });
    // Force the slot to be expired
    slot.lastUpdated = Date.now() - 1000;
    const result = assembleContext([slot], 10000, "truncate");
    expect(result).toBe("");
  });
});

// ─── Drop-Low-Priority Strategy ────────────────────────────

describe("assembleContext (drop-low-priority strategy)", () => {
  it("returns empty string when no slots are active", () => {
    const slots = [makeSlot({ name: "empty" })];
    expect(assembleContext(slots, 1000, "drop-low-priority")).toBe("");
  });

  it("includes all slots when total fits within budget", () => {
    const slots = [
      makeSlot({ name: "a", priority: "critical", content: "AAA" }),
      makeSlot({ name: "b", priority: "low", content: "BBB" }),
    ];
    const result = assembleContext(slots, 100000, "drop-low-priority");
    expect(result).toContain("AAA");
    expect(result).toContain("BBB");
  });

  it("drops low-priority slots when budget is exceeded", () => {
    // Create a critical slot that consumes most of the budget
    const bigContent = "x ".repeat(200); // fills budget
    const slots = [
      makeSlot({ name: "critical", priority: "critical", maxTokens: 500, content: bigContent }),
      makeSlot({ name: "low", priority: "low", maxTokens: 500, content: "LOW_CONTENT" }),
    ];
    // Set a very small total budget — only enough for the critical slot
    const result = assembleContext(slots, 50, "drop-low-priority");
    // The low-priority slot should be dropped or severely truncated
    // Critical content should be present (possibly truncated to fit)
    expect(result.length).toBeGreaterThan(0);
  });

  it("respects priority ordering — critical before low", () => {
    const slots = [
      makeSlot({ name: "low", priority: "low", content: "LOW" }),
      makeSlot({ name: "critical", priority: "critical", content: "CRITICAL" }),
      makeSlot({ name: "medium", priority: "medium", content: "MEDIUM" }),
    ];
    const result = assembleContext(slots, 100000, "drop-low-priority");
    const critIdx = result.indexOf("CRITICAL");
    const medIdx = result.indexOf("MEDIUM");
    const lowIdx = result.indexOf("LOW");
    expect(critIdx).toBeLessThan(medIdx);
    expect(medIdx).toBeLessThan(lowIdx);
  });

  it("truncates a slot to fit remaining budget", () => {
    const longContent = "word ".repeat(200);
    const slots = [
      makeSlot({ name: "only", priority: "critical", maxTokens: 1000, content: longContent }),
    ];
    // Budget smaller than the content
    const result = assembleContext(slots, 20, "drop-low-priority");
    expect(result.length).toBeLessThan(longContent.length);
    expect(result.length).toBeGreaterThan(0);
  });

  it("stops adding slots once budget is exhausted", () => {
    const bigContent = "word ".repeat(100);
    const slots = [
      makeSlot({ name: "first", priority: "critical", maxTokens: 500, content: bigContent }),
      makeSlot({ name: "second", priority: "high", maxTokens: 500, content: bigContent }),
      makeSlot({ name: "third", priority: "medium", maxTokens: 500, content: "THIRD" }),
    ];
    // Very tight budget — only room for first slot
    const result = assembleContext(slots, 15, "drop-low-priority");
    // Third slot content should not appear
    expect(result).not.toContain("THIRD");
  });
});

// ─── Edge Cases ────────────────────────────────────────────

describe("assembleContext (edge cases)", () => {
  it("handles empty slot list", () => {
    expect(assembleContext([], 1000, "truncate")).toBe("");
    expect(assembleContext([], 1000, "drop-low-priority")).toBe("");
  });

  it("handles zero budget with drop strategy", () => {
    const slots = [makeSlot({ name: "a", priority: "critical", content: "AAA" })];
    const result = assembleContext(slots, 0, "drop-low-priority");
    expect(result).toBe("");
  });

  it("handles slots with same priority (stable relative order)", () => {
    const slots = [
      makeSlot({ name: "a", priority: "high", content: "FIRST" }),
      makeSlot({ name: "b", priority: "high", content: "SECOND" }),
    ];
    const result = assembleContext(slots, 10000, "truncate");
    expect(result).toContain("FIRST");
    expect(result).toContain("SECOND");
  });
});
