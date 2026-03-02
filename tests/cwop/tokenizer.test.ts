import { describe, it, expect } from "bun:test";
import { estimateTokens, truncateToTokens } from "../../src/cwop/tokenizer.js";

describe("estimateTokens", () => {
  it("returns 0 for empty string", () => {
    expect(estimateTokens("")).toBe(0);
  });

  it("estimates English text at ~3.8 chars/token", () => {
    const text = "This is a simple English sentence for testing purposes.";
    const tokens = estimateTokens(text);
    // 55 chars / 3.8 ≈ 15 tokens
    expect(tokens).toBeGreaterThan(10);
    expect(tokens).toBeLessThan(20);
  });

  it("estimates code at ~3.2 chars/token (denser)", () => {
    const code = `public class Foo {
  private readonly string _bar;
  public Foo(string bar) => _bar = bar;
}`;
    const tokens = estimateTokens(code);
    // Code should tokenize as more tokens than English of same length
    const english = "a".repeat(code.length);
    expect(tokens).toBeGreaterThan(estimateTokens(english));
  });
});

describe("truncateToTokens", () => {
  it("returns text unchanged if within budget", () => {
    const text = "short";
    expect(truncateToTokens(text, 100)).toBe(text);
  });

  it("truncates text exceeding budget", () => {
    const text = "a".repeat(1000);
    const result = truncateToTokens(text, 50);
    expect(result.length).toBeLessThan(text.length);
    expect(result).toContain("[...truncated to fit context budget]");
  });
});
