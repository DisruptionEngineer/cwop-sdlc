const AVG_CHARS_PER_TOKEN = 3.8;
const CODE_CHARS_PER_TOKEN = 3.2;
const CODE_PATTERN = /^[\s]*[{}[\]()=>|;:,#@]/m;

export function estimateTokens(text: string): number {
  if (!text) return 0;
  const isCode = CODE_PATTERN.test(text);
  const charsPerToken = isCode ? CODE_CHARS_PER_TOKEN : AVG_CHARS_PER_TOKEN;
  const cjkCount = (text.match(/[\u4e00-\u9fff\u3040-\u30ff]/g) ?? []).length;
  const nonCjk = text.length - cjkCount;
  return Math.ceil(nonCjk / charsPerToken) + cjkCount;
}

const TRUNCATION_MARKER = "\n[...truncated]";
const MARKER_TOKENS = estimateTokens(TRUNCATION_MARKER);

export function truncateToTokens(text: string, maxTokens: number): string {
  const estimated = estimateTokens(text);
  if (estimated <= maxTokens) return text;

  // Reserve budget for the truncation marker
  const contentBudget = Math.max(1, maxTokens - MARKER_TOKENS);
  const ratio = contentBudget / estimated;
  // Use 0.92 safety factor, then re-verify in a tightening loop
  let cutAt = Math.floor(text.length * ratio * 0.92);
  let result = text.slice(0, cutAt) + TRUNCATION_MARKER;

  // Tighten: shave off content if still over budget (up to 5 passes)
  for (let i = 0; i < 5 && estimateTokens(result) > maxTokens; i++) {
    cutAt = Math.floor(cutAt * 0.85);
    result = text.slice(0, cutAt) + TRUNCATION_MARKER;
  }

  return result;
}
