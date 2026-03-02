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

export function truncateToTokens(text: string, maxTokens: number): string {
  const estimated = estimateTokens(text);
  if (estimated <= maxTokens) return text;
  const ratio = maxTokens / estimated;
  const cutAt = Math.floor(text.length * ratio * 0.95);
  return text.slice(0, cutAt) + "\n[...truncated to fit context budget]";
}
