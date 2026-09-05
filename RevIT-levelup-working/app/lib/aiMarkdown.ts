function normalizeMarkdownSegment(segment: string) {
  const normalized = segment
    .replace(/\\<(\/?)(sub|sup)>/gi, "<$1$2>")
    .replace(
      /\\times\s+\\kappaP_\{Cr\}\}/g,
      String.raw`\times \kappa}{P_{Cr}}`,
    )
    .replace(
      /\\(alpha|beta|gamma|delta|epsilon|zeta|eta|theta|iota|kappa|lambda|mu|nu|xi|omicron|pi|rho|sigma|tau|upsilon|phi|chi|psi|omega|Delta|Gamma|Lambda|Omega|Phi|Pi|Psi|Sigma|Theta|Upsilon|Xi|times|cdot|approx|pm|log|ln|exp)([A-Z])/g,
      "\\$1 $2",
    )
    .replace(/\\\[([\s\S]*?)\\\]/g, (_match, expression: string) => `\n\n$$\n${expression.trim()}\n$$\n\n`)
    .replace(/\\\((.*?)\\\)/g, (_match, expression: string) => `$${expression.trim()}$`);

  return normalized
    .split(/(\$\$[\s\S]*?\$\$|\$(?!\$)[^$\n]+?\$)/g)
    .map((part) => (part.startsWith("$")
      ? part
      : part.replace(
        /\(([^()\n]*(?:\\(?:frac|text|mathrm|operatorname|sqrt|times|cdot)|[_^]\{)[^()\n]*)\)/g,
        (_match, expression: string) => `$${expression.trim()}$`,
      )))
    .join("");
}

export function normalizeAiMarkdown(content: string) {
  return content
    .split(/(```[\s\S]*?```)/g)
    .map((segment) => (segment.startsWith("```") ? segment : normalizeMarkdownSegment(segment)))
    .join("")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
