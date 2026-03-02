/**
 * CWOP Code Review — PR review assistant extension for Pi
 *
 * Reviews code changes with CWOP-managed context windows.
 * Slots: review persona, checklist, PR metadata, PR diff,
 *        file context, related tests, ADO work items.
 *
 * Usage: pi -e extensions/code-review.ts
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { CWOPEngine } from "../src/cwop/engine.js";
import { CODE_REVIEW_PRESET } from "../src/cwop/presets/code-review.preset.js";
import { cwopFg, progressBar } from "./_shared/theme-utils.js";

const MODEL = process.env.CWOP_REVIEW_MODEL ?? "qwen2.5-coder:7b";

const REVIEW_PERSONA = `You are a senior code reviewer with expertise in C#/.NET, SQL, and Azure.
Review code for:
1. CORRECTNESS: Logic errors, off-by-one, null refs, race conditions
2. SECURITY: SQL injection, XSS, SSRF, secrets in code, insecure deserialization
3. PERFORMANCE: N+1 queries, missing indexes, unnecessary allocations, async pitfalls
4. MAINTAINABILITY: DRY violations, god classes, unclear naming, missing error handling
5. AZURE: Resource limits, retry policies, managed identity vs connection strings

Format reviews as:
- [CRITICAL] Must fix before merge
- [WARN] Should fix, creates tech debt
- [SUGGESTION] Optional improvement
- [GOOD] Positive callout for good patterns`;

const REVIEW_CHECKLIST = `C# Review Checklist:
- [ ] Nullable reference types enabled and handled
- [ ] IDisposable properly disposed (using statements)
- [ ] Async/await: no sync-over-async, ConfigureAwait where needed
- [ ] Exception handling: no catch-all swallowing, structured logging
- [ ] Input validation at API boundaries
SQL Review Checklist:
- [ ] No dynamic SQL / string concatenation
- [ ] Parameterized queries throughout
- [ ] Appropriate transaction isolation levels
- [ ] Indexes match query patterns
Azure Review Checklist:
- [ ] Connection strings from Key Vault / App Configuration
- [ ] Managed Identity over shared keys
- [ ] Retry policies with exponential backoff
- [ ] Resource limits documented in comments`;

export default function (pi: ExtensionAPI) {
  const cwop = new CWOPEngine(CODE_REVIEW_PRESET);
  let reviewCount = 0;
  let filesReviewed: string[] = [];

  // Load static slots
  cwop.updateSlot("system_persona", REVIEW_PERSONA);
  cwop.updateSlot("review_checklist", REVIEW_CHECKLIST);

  pi.on("session_start", async (_event, ctx) => {
    ctx.ui.setFooter((_tui, theme, _footerData) => {
      return {
        dispose() {},
        invalidate() {},
        render(width: number): string[] {
          const budget = cwop.getBudgetStatus();
          const left = theme.fg("dim", ` CWOP:Review `);
          const model = theme.fg("accent", MODEL);
          const bar = progressBar(budget.utilizationPct, 15);
          const pct = theme.fg("dim", ` ${budget.utilizationPct}% `);
          const count = theme.fg("dim", `reviews:${reviewCount}`);
          const right = ` ${model} ${bar}${pct}${count} `;
          const pad = " ".repeat(Math.max(1, width - stripAnsi(left).length - stripAnsi(right).length));
          return [left + pad + right];
        },
      };
    });

    ctx.ui.setWidget("cwop-review-status", (_tui, theme) => {
      return {
        render(width: number): string[] {
          const budget = cwop.getBudgetStatus();
          const lines: string[] = [];
          lines.push(cwopFg("brand", "┌─ CWOP Code Review ") + cwopFg("dim", "─".repeat(Math.max(0, width - 21))) + cwopFg("brand", "┐"));

          for (const slot of budget.slots) {
            const bar = progressBar(slot.utilization, 10);
            const status = slot.active ? cwopFg("success", "●") : cwopFg("dim", "○");
            const name = slot.name.padEnd(22);
            const tokens = `${slot.tokens}/${slot.max}`.padStart(10);
            lines.push(`${status} ${cwopFg("dim", name)} ${bar} ${cwopFg("dim", tokens)}`);
          }

          if (filesReviewed.length > 0) {
            lines.push(cwopFg("dim", "  Recently reviewed:"));
            for (const f of filesReviewed.slice(-3)) {
              lines.push(cwopFg("accent", `    ${f}`));
            }
          }

          lines.push(cwopFg("brand", "└") + cwopFg("dim", "─".repeat(Math.max(0, width - 2))) + cwopFg("brand", "┘"));
          return lines;
        },
        invalidate() {},
      };
    });
  });

  pi.on("tool_call", async (event, _ctx) => {
    // Track file reads as potential review targets
    if (event.toolName === "read" && event.args?.file_path) {
      const path = event.args.file_path as string;
      if (path.endsWith(".cs") || path.endsWith(".sql") || path.endsWith(".ts") || path.endsWith(".py")) {
        filesReviewed.push(path.split("/").pop() ?? path);
        if (filesReviewed.length > 10) filesReviewed = filesReviewed.slice(-10);
      }
    }

    // Track bash commands that look like git operations
    if (event.toolName === "bash" && event.args?.command) {
      const cmd = event.args.command as string;
      if (cmd.includes("git diff") || cmd.includes("git log")) {
        cwop.updateSlot("pr_diff", `[Git diff captured from: ${cmd}]`);
        reviewCount++;
      }
    }
  });
}

function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, "");
}
