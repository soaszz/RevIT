function normalizeMarkdownSegment(segment: string) {
  return segment
    .replace(/\\<(\/?)(sub|sup)>/gi, "<$1$2>")
    .replace(/\\\[([\s\S]*?)\\\]/g, (_match, expression: string) => `\n\n$$\n${expression.trim()}\n$$\n\n`)
    .replace(/\\\((.*?)\\\)/g, (_match, expression: string) => `$${expression.trim()}$`)
    .replace(
      /\(([^()\n]*(?:\\(?:frac|text|mathrm|operatorname|sqrt|times|cdot)|[_^]\{)[^()\n]*)\)/g,
      (_match, expression: string) => `$${expression.trim()}$`,
    );
}

export function normalizeAiMarkdown(content: string) {
  return content
    .split(/(```[\s\S]*?```)/g)
    .map((segment) => (segment.startsWith("```") ? segment : normalizeMarkdownSegment(segment)))
    .join("")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
