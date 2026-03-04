export type SlotCategory = "auto" | "demand" | "static";
export type SlotPriority = "critical" | "high" | "medium" | "low";

export interface ContextSlot {
  name: string;
  category: SlotCategory;
  priority: SlotPriority;
  content: string;
  tokenEstimate: number;
  maxTokens: number;
  lastUpdated: number;
  source: string;
  ttlMs?: number;
}

export interface SlotStatus {
  name: string;
  source: string;
  tokens: number;
  max: number;
  utilization: number;
  category: SlotCategory;
  priority: SlotPriority;
  active: boolean;
  expired: boolean;
}

export interface BudgetStatus {
  totalBudget: number;
  used: number;
  available: number;
  utilizationPct: number;
  slots: SlotStatus[];
  assembledAt: number;
  /** Recent audit entries (optional, included when requested). */
  recentAudit?: Array<{
    timestamp: number;
    slotName: string;
    action: string;
    tokensBefore: number;
    tokensAfter: number;
    contentPreview: string;
  }>;
}

export type OverflowStrategy = "truncate" | "drop-low-priority" | "summarize";

export interface CWOPConfig {
  totalBudget: number;
  overflowStrategy: OverflowStrategy;
  slots: SlotDefinition[];
}

export interface SlotDefinition {
  name: string;
  category: SlotCategory;
  priority: SlotPriority;
  maxTokens: number;
  source: string;
  ttlMs?: number;
}
