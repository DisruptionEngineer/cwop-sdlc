/**
 * CWOP Code Builder — C#/SQL/Azure scaffolding extension for Pi
 *
 * Generates code using CWOP-managed context windows.
 * Hooks into Pi's full event lifecycle:
 *   input         → target_spec (user's request)
 *   tool_result   → existing_code (actual file content from reads)
 *   tool_call     → previous_output (write/edit content)
 *   message_end   → previous_output (assistant's response)
 *
 * Usage: pi -e extensions/code-builder.ts
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { CWOPEngine } from "../src/cwop/engine.js";
import { CODE_BUILDER_PRESET } from "../src/cwop/presets/code-builder.preset.js";
import { cwopFg, progressBar } from "./_shared/theme-utils.js";

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

// File extensions relevant to this builder
const CODE_EXTENSIONS = new Set([
  ".cs", ".csx", ".csproj", ".sln", ".props", ".targets",
  ".sql", ".json", ".yaml", ".yml", ".bicep", ".xml",
  ".ts", ".tsx", ".js", ".py", ".go", ".rs",
]);

function isRelevantFile(path: string): boolean {
  return [...CODE_EXTENSIONS].some(ext => path.endsWith(ext));
}

export default function (pi: ExtensionAPI) {
  const cwop = new CWOPEngine(CODE_BUILDER_PRESET);
  let toolCount = 0;
  const toolCounts: Record<string, number> = {};
  // Rolling buffer of recently read file contents for existing_code slot
  let recentReads: { path: string; content: string }[] = [];

  // Load static slots
  cwop.updateSlot("system_persona", SYSTEM_PERSONA);
  cwop.updateSlot("tech_stack", TECH_STACK);

  // ── COMMANDS ──────────────────────────────────────────────

  // /clear <slot_name> — Clear a specific CWOP context slot
  pi.registerCommand("clear", {
    description: "Clear a CWOP context slot (e.g. /clear existing_code)",
    getArgumentCompletions: (prefix: string) => {
      const slotNames = [...cwop.slots.keys()];
      const items = slotNames.map(name => {
        const slot = cwop.slots.get(name)!;
        const label = slot.isActive
          ? `${name} (${slot.tokenEstimate}/${slot.maxTokens})`
          : `${name} (empty)`;
        return { value: name, label };
      });
      const filtered = items.filter(i => i.value.startsWith(prefix));
      return filtered.length > 0 ? filtered : items;
    },
    handler: async (args, ctx) => {
      const slotName = args?.trim();
      if (!slotName) {
        // No argument — show interactive picker of active slots
        const activeSlots = [...cwop.slots.entries()]
          .filter(([_, s]) => s.isActive)
          .map(([name, s]) => `${name} (${s.tokenEstimate}/${s.maxTokens} tokens)`);

        if (activeSlots.length === 0) {
          ctx.ui.notify("No active slots to clear.", "info");
          return;
        }

        const choice = await ctx.ui.select("Clear which slot?", activeSlots);
        if (choice === undefined) return;

        const name = choice.split(" (")[0];
        clearSlotByName(name, ctx);
        return;
      }

      clearSlotByName(slotName, ctx);
    },
  });

  // /cwop — Show current CWOP budget summary
  pi.registerCommand("cwop", {
    description: "Show CWOP context budget status",
    handler: async (args, ctx) => {
      const subcommand = args?.trim();

      if (subcommand === "audit") {
        // Show recent audit trail
        const recent = cwop.audit.slice(-10);
        if (recent.length === 0) {
          ctx.ui.notify("No audit entries yet.", "info");
          return;
        }
        const lines = recent.map(e => {
          const age = Math.round((Date.now() - e.timestamp) / 1000);
          return `[${age}s ago] ${e.action.toUpperCase().padEnd(7)} ${e.slotName.padEnd(22)} ${e.tokensBefore}→${e.tokensAfter} tokens`;
        });
        ctx.ui.notify(lines.join("\n"), "info");
        return;
      }

      if (subcommand === "reset") {
        // Reset all demand/auto slots, keep static
        const cleared: string[] = [];
        for (const [name, slot] of cwop.slots) {
          if (slot.category !== "static" && slot.isActive) {
            cwop.clearSlot(name);
            cleared.push(name);
          }
        }
        recentReads = [];
        ctx.ui.notify(
          cleared.length > 0
            ? `Reset ${cleared.length} slots: ${cleared.join(", ")}`
            : "No dynamic slots to reset.",
          "info",
        );
        return;
      }

      // Default: show status
      const budget = cwop.getBudgetStatus();
      const lines = [
        `Budget: ${budget.used}/${budget.totalBudget} tokens (${budget.utilizationPct}%)`,
        `Available: ${budget.available} tokens`,
        "",
        ...budget.slots.map(s => {
          const indicator = s.active ? "●" : "○";
          const pct = `${s.utilization}%`.padStart(4);
          const tokens = `${s.tokens}/${s.max}`.padStart(12);
          const warning = s.tokens > s.max ? " ⚠ OVER BUDGET" : "";
          return `${indicator} ${s.name.padEnd(22)} ${tokens} ${pct}${warning}`;
        }),
      ];
      ctx.ui.notify(lines.join("\n"), "info");
    },
  });

  function clearSlotByName(name: string, ctx: { ui: { notify: (msg: string, level: string) => void } }) {
    const slot = cwop.slots.get(name);
    if (!slot) {
      ctx.ui.notify(`Unknown slot: ${name}\nAvailable: ${[...cwop.slots.keys()].join(", ")}`, "error");
      return;
    }
    if (!slot.isActive) {
      ctx.ui.notify(`Slot "${name}" is already empty.`, "info");
      return;
    }
    const before = slot.tokenEstimate;
    cwop.clearSlot(name);
    // Also clear the read buffer if clearing existing_code
    if (name === "existing_code") {
      recentReads = [];
    }
    ctx.ui.notify(`Cleared "${name}" — freed ${before} tokens.`, "info");
  }

  // ── INPUT EVENT: Capture user's request → target_spec ──
  pi.on("input", async (event) => {
    if (event.text && event.text.trim().length > 0) {
      cwop.updateSlot("target_spec", event.text);
    }
    return { action: "continue" as const };
  });

  // ── TOOL CALL EVENT: Capture write/edit content before execution ──
  pi.on("tool_call", async (event) => {
    if (event.toolName === "write" && event.input) {
      const input = event.input as { path: string; content: string };
      if (input.content) {
        cwop.updateSlot("previous_output", input.content);
      }
      // Detect Azure-specific files
      if (input.path?.endsWith(".bicep") || input.path?.endsWith(".arm.json")) {
        cwop.updateSlot("azure_schema", input.content);
      }
    }

    if (event.toolName === "edit" && event.input) {
      const input = event.input as { path: string; oldText: string; newText: string };
      if (input.newText) {
        cwop.updateSlot("previous_output", `Edit in ${input.path}:\n${input.newText}`);
      }
    }
  });

  // ── TOOL RESULT EVENT: Capture actual file content from reads ──
  pi.on("tool_result", async (event) => {
    toolCount++;
    toolCounts[event.toolName] = (toolCounts[event.toolName] ?? 0) + 1;

    if (event.toolName === "read" && !event.isError && event.content) {
      const input = event.input as { path?: string };
      const path = input.path ?? "unknown";

      // Extract text content from the result
      const textParts = event.content
        .filter((c: { type: string }) => c.type === "text")
        .map((c: { type: string; text?: string }) => c.text ?? "");
      const fileContent = textParts.join("\n");

      if (isRelevantFile(path) && fileContent.length > 0) {
        // Add to rolling buffer
        recentReads.push({ path, content: fileContent });
        // Keep last 3 reads to stay within budget
        if (recentReads.length > 3) {
          recentReads = recentReads.slice(-3);
        }

        // Assemble existing_code slot from recent reads
        const assembled = recentReads
          .map(r => `--- ${r.path} ---\n${r.content}`)
          .join("\n\n");
        cwop.updateSlot("existing_code", assembled);

        // Detect SQL schema files
        if (path.endsWith(".sql") && (fileContent.includes("CREATE TABLE") || fileContent.includes("ALTER TABLE"))) {
          cwop.updateSlot("sql_schema", fileContent);
        }

        // Detect Azure / Bicep files
        if (path.endsWith(".bicep") || (path.endsWith(".json") && fileContent.includes('"$schema"') && fileContent.includes("microsoft.com"))) {
          cwop.updateSlot("azure_schema", fileContent);
        }
      }
    }

    // Capture bash output that looks like git/project info
    if (event.toolName === "bash" && !event.isError && event.content) {
      const textParts = event.content
        .filter((c: { type: string }) => c.type === "text")
        .map((c: { type: string; text?: string }) => c.text ?? "");
      const output = textParts.join("\n");

      // Detect project convention signals (dotnet list, csproj content, etc.)
      if (output.includes(".csproj") || output.includes("<PropertyGroup>") || output.includes("dotnet")) {
        cwop.updateSlot("project_conventions", output);
      }
    }

    return { action: "continue" as const };
  });

  // ── MESSAGE END EVENT: Capture assistant response → previous_output ──
  pi.on("message_end", async (event) => {
    const msg = event.message;
    if (msg && msg.role === "assistant") {
      // Extract text content from assistant message
      const textContent = (msg.content ?? [])
        .filter((c: { type: string }) => c.type === "text")
        .map((c: { type: string; text?: string }) => c.text ?? "")
        .join("\n");

      if (textContent.length > 0) {
        cwop.updateSlot("previous_output", textContent);
      }
    }
  });

  // ── SESSION START: Set up UI widgets ──
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

          // Budget summary line
          const budgetBar = progressBar(budget.utilizationPct, 15);
          lines.push(`  ${cwopFg("accent", "Budget")} ${budgetBar} ${cwopFg("dim", `${budget.used}/${budget.totalBudget} tokens (${budget.utilizationPct}%)`)}`);
          lines.push(cwopFg("dim", "  " + "─".repeat(Math.max(0, width - 4))));

          // Slot breakdown
          for (const slot of budget.slots) {
            const bar = progressBar(slot.utilization, 10);
            const status = slot.active ? cwopFg("success", "●") : cwopFg("dim", "○");
            const name = slot.name.padEnd(20);
            const tokens = `${slot.tokens}/${slot.max}`.padStart(10);
            lines.push(`${status} ${cwopFg("dim", name)} ${bar} ${cwopFg("dim", tokens)}`);
          }

          // Tool usage summary
          if (toolCount > 0) {
            lines.push(cwopFg("dim", "  " + "─".repeat(Math.max(0, width - 4))));
            const top = Object.entries(toolCounts)
              .sort(([, a], [, b]) => b - a)
              .slice(0, 4)
              .map(([name, count]) => `${name}:${count}`)
              .join("  ");
            lines.push(`  ${cwopFg("accent", "Tools")} ${cwopFg("dim", `${toolCount} total`)}  ${cwopFg("dim", top)}`);
          }

          lines.push(cwopFg("brand", "└") + cwopFg("dim", "─".repeat(Math.max(0, width - 2))) + cwopFg("brand", "┘"));
          return lines;
        },
        invalidate() {},
      };
    });
  });
}

function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, "");
}
