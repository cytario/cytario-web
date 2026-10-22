import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { markdownComponents } from "./markdownComponents";

interface FormattedTextViewProps {
  markdown: string;
}

/**
 * Read-only formatted rendering for Markdown-family sources (`.md` /
 * `.markdown` / `.qmd`). Unknown formats render as plain text (see
 * PlainTextView) — this component is the known-Markdown case only.
 */
export function FormattedTextView({ markdown }: FormattedTextViewProps) {
  return (
    <div className="flex-1 overflow-auto px-6 py-4 text-foreground">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
