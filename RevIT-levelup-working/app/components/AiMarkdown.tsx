import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { normalizeAiMarkdown } from "../lib/aiMarkdown";

const aiMarkdownSchema = {
  ...defaultSchema,
  tagNames: [...new Set([...(defaultSchema.tagNames ?? []), "sub", "sup"])],
  attributes: {
    ...defaultSchema.attributes,
    code: [
      ...(defaultSchema.attributes?.code ?? []),
      ["className", /^language-./, "math-inline", "math-display"],
    ],
  },
};

export default function AiMarkdown({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[
        rehypeRaw,
        [rehypeSanitize, aiMarkdownSchema],
        [rehypeKatex, { throwOnError: false, strict: "ignore" }],
      ]}
    >
      {normalizeAiMarkdown(content)}
    </ReactMarkdown>
  );
}
