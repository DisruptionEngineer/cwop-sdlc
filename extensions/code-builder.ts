/**
 * CWOP Code Builder — C#/SQL/Azure scaffolding extension for Pi
 *
 * Generates code using CWOP-managed context windows.
 * Slots: system persona, tech stack, project conventions, target spec,
 *        existing code, azure schema, sql schema, previous output.
 *
 * Usage: pi -e extensions/code-builder.ts
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { CWOPEngine } from "../src/cwop/engine.js";
import { CODE_BUILDER_PRESET } from "../src/cwop/presets/code-builder.preset.js";
import { OllamaProvider } from "../src/llm/ollama.provider.js";
import { cwopFg, progressBar } from "./_shared/theme-utils.js";

const OLLAMA_URL = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
const MODEL = process.env.CWOP_CODE_MODEL ?? "qwen2.5-coder:7b";

const SYSTEM_PERSONA = `You are a senior software engineer specializing in C#/.NET, SQL Server, and Azure cloud services.
You write clean, production-ready code following SOLID principles and Microsoft coding conventions.
When generating code:
- Use C# 12 / .NET 8 features (primary constructors, collection expressions, etc.)
- Follow Azure best practices for Functions, App Service, and SQL
- Include XML doc comments on public APIs
- Use nullable reference types
- Prefer record types for DTOs
When generating SQL:
- Use parameterized queries (never string concatenation)
- Include appropriate indexes in CREATE TABLE statements
- Use MERGE for upserts, OUTPUT for returning inserted data`;

const TECH_STACK = `Primary Stack:
- C# 12 / .NET 8 (ASP.NET Core, Azure Functions v4, Entity Framework Core 8)
- Azure SQL Database, Azure Blob Storage, Azure Service Bus
- Azure DevOps (Pipelines, Boards, Repos)
- Microsoft Teams (Webhooks, Bot Framework)
- xUnit + Moq for testing, FluentAssertions
Secondary/Side Projects:
- TypeScript/Node.js, Python, Go, Rust
- PostgreSQL, Redis, RabbitMQ`;

export default function (pi: ExtensionAPI) {
  const cwop = new CWOPEngine(CODE_BUILDER_PRESET);
  const ollama = new OllamaProvider(OLLAMA_URL);
  let toolCount = 0;

  // Load static slots
  cwop.updateSlot("system_persona", SYSTEM_PERSONA);
  cwop.updateSlot("tech_stack", TECH_STACK);

  pi.on("session_start", async (_event, ctx) => {
    // Footer: show model + CWOP budget
    ctx.ui.setFooter((_tui, theme, _footerData) => {
      return {
        dispose() {},
        invalidate() {},
        render(width: number): string[] {
          const budget = cwop.getBudgetStatus();
          const left = theme.fg("dim", ` CWOP:Builder `);
          const model = theme.fg("accent", MODEL);
          const bar = progressBar(budget.utilizationPct, 15);
          const pct = theme.fg("dim", ` ${budget.utilizationPct}% `);
          const tools = theme.fg("dim", `tools:${toolCount}`);
          const right = ` ${model} ${bar}${pct}${tools} `;
          const pad = " ".repeat(Math.max(1, width - stripAnsi(left).length - stripAnsi(right).length));
          return [left + pad + right];
        },
      };
    });

    // Widget: live CWOP slot visualization
    ctx.ui.setWidget("cwop-builder-status", (_tui, theme) => {
      return {
        render(width: number): string[] {
          const budget = cwop.getBudgetStatus();
          const lines: string[] = [];
          lines.push(cwopFg("brand", "┌─ CWOP Code Builder ") + cwopFg("dim", "─".repeat(Math.max(0, width - 22))) + cwopFg("brand", "┐"));

          for (const slot of budget.slots) {
            const bar = progressBar(slot.utilization, 10);
            const status = slot.active ? cwopFg("success", "●") : cwopFg("dim", "○");
            const name = slot.name.padEnd(20);
            const tokens = `${slot.tokens}/${slot.max}`.padStart(10);
            lines.push(`${status} ${cwopFg("dim", name)} ${bar} ${cwopFg("dim", tokens)}`);
          }

          lines.push(cwopFg("brand", "└") + cwopFg("dim", "─".repeat(Math.max(0, width - 2))) + cwopFg("brand", "┘"));
          return lines;
        },
        invalidate() {},
      };
    });
  });

  // Track tool usage for code generation context
  pi.on("tool_call", async (event, ctx) => {
    // When Pi reads a file, inject it into the existing_code slot
    if (event.toolName === "read" && event.args?.file_path) {
      const path = event.args.file_path as string;
      if (path.endsWith(".cs") || path.endsWith(".sql") || path.endsWith(".csproj") || path.endsWith(".json")) {
        // Pi will handle the actual read; we note the path for context
        cwop.updateSlot("existing_code", `[Context: ${path} loaded by Pi read tool]`);
      }
    }

    // When Pi writes code, capture it as previous output
    if (event.toolName === "write" && event.args?.content) {
      const content = event.args.content as string;
      cwop.updateSlot("previous_output", content.slice(0, 1600));
    }
  });

  pi.on("tool_execution_end", async (_event) => {
    toolCount++;
  });
}

function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, "");
}
