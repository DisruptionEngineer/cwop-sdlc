/**
 * CWOP Dashboard — Real-time context budget visualization widget for Pi
 *
 * Shows live CWOP status across all active extensions.
 * Connects to the gateway to aggregate budgets.
 *
 * Usage: pi -e extensions/cwop-dashboard.ts
 * Compose: pi -e extensions/code-builder.ts -e extensions/cwop-dashboard.ts
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { cwopFg, progressBar } from "./_shared/theme-utils.js";
import { fetchBudgetStatus, fetchHealthStatus } from "./_shared/cwop-client.js";

interface DashboardState {
  extensions: Map<string, { name: string; budgetPct: number; used: number; total: number; model: string }>;
  ollamaHealthy: boolean;
  ollamaModels: number;
  lastRefresh: number;
  toolCounts: Record<string, number>;
  sessionStart: number;
}

export default function (pi: ExtensionAPI) {
  let refreshTimer: ReturnType<typeof setInterval> | null = null;

  const state: DashboardState = {
    extensions: new Map(),
    ollamaHealthy: false,
    ollamaModels: 0,
    lastRefresh: 0,
    toolCounts: {},
    sessionStart: Date.now(),
  };

  // Poll gateway for status
  async function refreshStatus() {
    const health = await fetchHealthStatus();
    if (health) {
      state.ollamaHealthy = health.healthy;
      state.ollamaModels = health.models.length;
    }

    for (const extId of ["code-builder", "code-review"]) {
      const budget = await fetchBudgetStatus(extId);
      if (budget) {
        state.extensions.set(extId, {
          name: extId,
          budgetPct: budget.utilizationPct,
          used: budget.used,
          total: budget.totalBudget,
          model: process.env[`CWOP_${extId.toUpperCase().replace("-", "_")}_MODEL`] ?? "default",
        });
      }
    }
    state.lastRefresh = Date.now();
  }

  pi.on("session_start", async (_event, ctx) => {
    // Initial status check
    await refreshStatus();

    // Compact footer
    ctx.ui.setFooter((_tui, theme, _footerData) => {
      return {
        dispose() {},
        invalidate() {},
        render(width: number): string[] {
          const ollamaStatus = state.ollamaHealthy
            ? cwopFg("success", "● Ollama")
            : cwopFg("danger", "○ Ollama");
          const models = cwopFg("dim", `${state.ollamaModels} models`);
          const uptime = formatUptime(Date.now() - state.sessionStart);
          const left = ` ${ollamaStatus} ${models}`;
          const right = `${cwopFg("dim", uptime)} `;
          const pad = " ".repeat(Math.max(1, width - stripAnsi(left).length - stripAnsi(right).length));
          return [left + pad + right];
        },
      };
    });

    // Main dashboard widget
    ctx.ui.setWidget("cwop-dashboard", (_tui, _theme) => {
      return {
        render(width: number): string[] {
          const lines: string[] = [];
          const w = Math.min(width, 60);

          lines.push(cwopFg("brand", "╔═ CWOP Dashboard ") + cwopFg("dim", "═".repeat(Math.max(0, w - 20))) + cwopFg("brand", "╗"));

          // Ollama status
          const ollamaIcon = state.ollamaHealthy ? cwopFg("success", "●") : cwopFg("danger", "●");
          lines.push(`${cwopFg("brand", "║")} ${ollamaIcon} Ollama: ${state.ollamaHealthy ? cwopFg("success", "connected") : cwopFg("danger", "disconnected")} ${cwopFg("dim", `(${state.ollamaModels} models)`)}`);
          lines.push(`${cwopFg("brand", "║")} ${cwopFg("dim", "─".repeat(w - 4))}`);

          // Extension budgets
          if (state.extensions.size === 0) {
            lines.push(`${cwopFg("brand", "║")} ${cwopFg("dim", "No extensions reporting. Start gateway: just gateway")}`);
          } else {
            for (const [id, ext] of state.extensions) {
              const bar = progressBar(ext.budgetPct, 15);
              const label = id.padEnd(15);
              lines.push(`${cwopFg("brand", "║")} ${cwopFg("accent", label)} ${bar} ${cwopFg("dim", `${ext.used}/${ext.total} tokens`)}`);
            }
          }

          // Tool usage summary
          const totalTools = Object.values(state.toolCounts).reduce((a, b) => a + b, 0);
          if (totalTools > 0) {
            lines.push(`${cwopFg("brand", "║")} ${cwopFg("dim", "─".repeat(w - 4))}`);
            const top3 = Object.entries(state.toolCounts)
              .sort(([, a], [, b]) => b - a)
              .slice(0, 3)
              .map(([name, count]) => `${name}:${count}`)
              .join(" ");
            lines.push(`${cwopFg("brand", "║")} ${cwopFg("dim", "Tools:")} ${cwopFg("accent", top3)} ${cwopFg("dim", `(${totalTools} total)`)}`);
          }

          lines.push(cwopFg("brand", "╚") + cwopFg("dim", "═".repeat(Math.max(0, w - 2))) + cwopFg("brand", "╝"));
          return lines;
        },
        invalidate() {},
      };
    });

    // Refresh status periodically (clear previous timer if session restarts)
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(() => refreshStatus(), 10_000);
  });

  pi.on("tool_execution_end", async (event) => {
    state.toolCounts[event.toolName] = (state.toolCounts[event.toolName] ?? 0) + 1;
  });
}

function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, "");
}

function formatUptime(ms: number): string {
  const mins = Math.floor(ms / 60_000);
  const hrs = Math.floor(mins / 60);
  if (hrs > 0) return `${hrs}h ${mins % 60}m`;
  return `${mins}m`;
}
