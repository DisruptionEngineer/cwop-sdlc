import type { CWOPConfig } from "../../types/cwop.js";

export const CODE_REVIEW_PRESET: CWOPConfig = {
  totalBudget: 8000,
  overflowStrategy: "drop-low-priority",
  slots: [
    {
      name: "system_persona",
      category: "static",
      priority: "critical",
      maxTokens: 350,
      source: "Review Persona",
    },
    {
      name: "review_checklist",
      category: "static",
      priority: "high",
      maxTokens: 400,
      source: "Review Checklist",
    },
    {
      name: "pr_metadata",
      category: "auto",
      priority: "critical",
      maxTokens: 300,
      source: "PR Metadata",
    },
    {
      name: "pr_diff",
      category: "auto",
      priority: "critical",
      maxTokens: 3500,
      source: "PR Diff",
    },
    {
      name: "changed_file_context",
      category: "auto",
      priority: "high",
      maxTokens: 1500,
      source: "Surrounding File Context",
      ttlMs: 120_000,
    },
    {
      name: "related_tests",
      category: "demand",
      priority: "medium",
      maxTokens: 800,
      source: "Related Tests",
    },
    {
      name: "ado_work_items",
      category: "demand",
      priority: "low",
      maxTokens: 400,
      source: "Azure DevOps Work Items",
      ttlMs: 300_000,
    },
    {
      name: "past_review_comments",
      category: "demand",
      priority: "low",
      maxTokens: 400,
      source: "Past Review Comments",
    },
  ],
};
