import type { CWOPConfig } from "../../types/cwop.js";

export const DASHBOARD_PRESET: CWOPConfig = {
  totalBudget: 2000,
  overflowStrategy: "truncate",
  slots: [
    {
      name: "system_persona",
      category: "static",
      priority: "critical",
      maxTokens: 200,
      source: "Dashboard Persona",
    },
    {
      name: "current_budgets",
      category: "auto",
      priority: "critical",
      maxTokens: 600,
      source: "Live CWOP Status",
      ttlMs: 5_000,
    },
    {
      name: "model_status",
      category: "auto",
      priority: "high",
      maxTokens: 300,
      source: "Ollama Health",
      ttlMs: 30_000,
    },
    {
      name: "extension_states",
      category: "auto",
      priority: "high",
      maxTokens: 500,
      source: "Extension Registry",
      ttlMs: 10_000,
    },
  ],
};
