// CWOP color tokens matching the dark theme
export const CWOP_COLORS = {
  brand: "\x1b[38;2;0;200;180m",      // teal
  accent: "\x1b[38;2;100;180;255m",    // blue
  success: "\x1b[38;2;0;220;100m",     // green
  warning: "\x1b[38;2;255;180;0m",     // amber
  danger: "\x1b[38;2;255;80;80m",      // red
  dim: "\x1b[38;2;120;120;140m",       // muted gray
  reset: "\x1b[0m",
} as const;

export function cwopFg(color: keyof typeof CWOP_COLORS, text: string): string {
  return `${CWOP_COLORS[color]}${text}${CWOP_COLORS.reset}`;
}

export function progressBar(pct: number, width: number): string {
  const filled = Math.round((pct / 100) * width);
  const empty = width - filled;
  const color = pct > 90 ? CWOP_COLORS.danger : pct > 70 ? CWOP_COLORS.warning : CWOP_COLORS.success;
  return `${color}${"█".repeat(filled)}${CWOP_COLORS.dim}${"░".repeat(empty)}${CWOP_COLORS.reset}`;
}
