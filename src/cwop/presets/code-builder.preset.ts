import type { CWOPConfig } from "../../types/cwop.js";

export const CODE_BUILDER_PRESET: CWOPConfig = {
  totalBudget: 6000,
  overflowStrategy: "drop-low-priority",
  slots: [
    {
      name: "system_persona",
      category: "static",
      priority: "critical",
      maxTokens: 400,
      source: "System Persona",
    },
    {
      name: "tech_stack",
      category: "static",
      priority: "critical",
      maxTokens: 300,
      source: "Tech Stack Context",
    },
    {
      name: "project_conventions",
      category: "static",
      priority: "high",
      maxTokens: 600,
      source: "Project Conventions",
    },
    {
      name: "target_spec",
      category: "auto",
      priority: "critical",
      maxTokens: 800,
      source: "User Specification",
    },
    {
      name: "existing_code",
      category: "auto",
      priority: "high",
      maxTokens: 1500,
      source: "Existing Code Context",
      ttlMs: 300_000,
    },
    {
      name: "azure_schema",
      category: "demand",
      priority: "high",
      maxTokens: 800,
      source: "Azure Schema / Bicep",
    },
    {
      name: "sql_schema",
      category: "demand",
      priority: "medium",
      maxTokens: 700,
      source: "SQL Schema",
      ttlMs: 600_000,
    },
    {
      name: "previous_output",
      category: "auto",
      priority: "medium",
      maxTokens: 400,
      source: "Previous Generation",
      ttlMs: 180_000,
    },
  ],
};
