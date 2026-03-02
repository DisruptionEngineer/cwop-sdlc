import type { CWOPSlot } from "./slot.js";
import type { OverflowStrategy } from "../types/cwop.js";
import { estimateTokens, truncateToTokens } from "./tokenizer.js";

const PRIORITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export function assembleContext(
  slots: CWOPSlot[],
  totalBudget: number,
  strategy: OverflowStrategy,
): string {
  const active = slots
    .filter(s => s.isActive)
    .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);

  if (strategy === "drop-low-priority") {
    return assembleWithDrop(active, totalBudget);
  }
  return assembleWithTruncation(active);
}

function assembleWithTruncation(slots: CWOPSlot[]): string {
  const parts: string[] = [];
  for (const slot of slots) {
    const content = slot.tokenEstimate > slot.maxTokens
      ? truncateToTokens(slot.content, slot.maxTokens)
      : slot.content;
    parts.push(content);
  }
  return parts.join("\n\n");
}

function assembleWithDrop(slots: CWOPSlot[], totalBudget: number): string {
  const parts: string[] = [];
  let remaining = totalBudget;

  for (const slot of slots) {
    if (remaining <= 0) break;
    const budget = Math.min(slot.maxTokens, remaining);
    const content = slot.tokenEstimate > budget
      ? truncateToTokens(slot.content, budget)
      : slot.content;
    parts.push(content);
    remaining -= estimateTokens(content);
  }

  return parts.join("\n\n");
}
