/**
 * CWOP Code Review — PR review assistant extension for Pi
 *
 * Reviews code changes with CWOP-managed context windows.
 * Hooks into Pi's full event lifecycle:
 *   input         → pr_metadata (user's review request)
 *   tool_result   → pr_diff, changed_file_context, related_tests (actual content)
 *   tool_call     → tracks git operations
 *   message_end   → past_review_comments (assistant's review output)
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

const CODE_EXTENSIONS = new Set([
  ".cs", ".csx", ".csproj", ".sql", ".ts", ".tsx", ".js",
  ".py", ".go", ".rs", ".json", ".yaml", ".yml", ".bicep",
]);

const TEST_PATTERNS = ["test", "spec", "Test", "Spec", "_test", ".test"];

function isTestFile(path: string): boolean {
  return TEST_PATTERNS.some(p => path.includes(p));
}

function isCodeFile(path: string): boolean {
  return [...CODE_EXTENSIONS].some(ext => path.endsWith(ext));
}

export default function (pi: ExtensionAPI) {
  const cwop = new CWOPEngine(CODE_REVIEW_PRESET);
  let reviewCount = 0;
  let filesReviewed: string[] = [];
  let recentFileReads: { path: string; content: string }[] = [];

  // Load static slots
  cwop.updateSlot("system_persona", REVIEW_PERSONA);
  cwop.updateSlot("review_checklist", REVIEW_CHECKLIST);

  // ── INPUT EVENT: Capture user's review request → pr_metadata ──
  pi.on("input", async (event) => {
    if (event.text && event.text.trim().length > 0) {
      cwop.updateSlot("pr_metadata", event.text);
    }
    return { action: "continue" as const };
  });

  // ── TOOL CALL EVENT: Track git operations and writes ──
  pi.on("tool_call", async (event) => {
    if (event.toolName === "bash" && event.input) {
      const input = event.input as { command: string };
      const cmd = input.command ?? "";

      // Mark that a git diff operation is happening
      if (cmd.includes("git diff") || cmd.includes("git log") || cmd.includes("git show")) {
        reviewCount++;
      }
    }
  });

  // ── TOOL RESULT EVENT: Capture actual content from tool outputs ──
  pi.on("tool_result", async (event) => {
    // Extract text content helper
    const textContent = (event.content ?? [])
      .filter((c: { type: string }) => c.type === "text")
      .map((c: { type: string; text?: string }) => c.text ?? "")
      .join("\n");

    // Read tool results → file context slots
    if (event.toolName === "read" && !event.isError && textContent.length > 0) {
      const input = event.input as { path?: string };
      const path = input.path ?? "unknown";
      const fileName = path.split("/").pop() ?? path;

      if (isCodeFile(path)) {
        filesReviewed.push(fileName);
        if (filesReviewed.length > 10) filesReviewed = filesReviewed.slice(-10);

        // Route to test slot or file context slot
        if (isTestFile(path)) {
          cwop.updateSlot("related_tests", `--- ${path} ---\n${textContent}`);
        } else {
          // Add to rolling read buffer
          recentFileReads.push({ path, content: textContent });
          if (recentFileReads.length > 3) recentFileReads = recentFileReads.slice(-3);

          const assembled = recentFileReads
            .map(r => `--- ${r.path} ---\n${r.content}`)
            .join("\n\n");
          cwop.updateSlot("changed_file_context", assembled);
        }
      }
    }

    // Bash tool results → capture git diff output
    if (event.toolName === "bash" && !event.isError && textContent.length > 0) {
      const input = event.input as { command?: string };
      const cmd = input.command ?? "";

      if (cmd.includes("git diff")) {
        cwop.updateSlot("pr_diff", textContent);
      }

      if (cmd.includes("git log")) {
        // Git log output can supplement PR metadata
        const currentMeta = cwop.slots.get("pr_metadata")?.content ?? "";
        cwop.updateSlot("pr_metadata", currentMeta + "\n\nGit History:\n" + textContent);
      }

      // Detect Azure DevOps work item references
      if (cmd.includes("az boards") || textContent.includes("AB#") || textContent.includes("work-item")) {
        cwop.updateSlot("ado_work_items", textContent);
      }
    }

    return { action: "continue" as const };
  });

  // ── MESSAGE END EVENT: Capture assistant review output ──
  pi.on("message_end", async (event) => {
    const msg = event.message;
    if (msg && msg.role === "assistant") {
      const text = (msg.content ?? [])
        .filter((c: { type: string }) => c.type === "text")
        .map((c: { type: string; text?: string }) => c.text ?? "")
        .join("\n");

      if (text.length > 0 && (text.includes("[CRITICAL]") || text.includes("[WARN]") || text.includes("[SUGGESTION]"))) {
        cwop.updateSlot("past_review_comments", text);
      }
    }
  });

  // ── SESSION START: Set up UI widgets ──
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
}

function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, "");
}
