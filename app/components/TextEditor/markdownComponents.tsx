import type { Components } from "react-markdown";

/**
 * Element renderers for formatted Markdown view mode. Raw HTML in the source
 * renders as literal text (no rehype-raw), so untrusted markup is never
 * executed.
 */
export const markdownComponents: Components = {
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary underline underline-offset-2"
    >
      {children}
    </a>
  ),
  h1: ({ children }) => <h1 className="mt-6 mb-3 text-2xl font-semibold">{children}</h1>,
  h2: ({ children }) => <h2 className="mt-6 mb-2 text-xl font-semibold">{children}</h2>,
  h3: ({ children }) => <h3 className="mt-4 mb-2 text-lg font-semibold">{children}</h3>,
  p: ({ children }) => <p className="my-3 text-sm leading-6">{children}</p>,
  ul: ({ children }) => <ul className="my-3 list-disc space-y-1 pl-6 text-sm">{children}</ul>,
  ol: ({ children }) => <ol className="my-3 list-decimal space-y-1 pl-6 text-sm">{children}</ol>,
  li: ({ children }) => <li className="leading-6">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="my-3 border-l-2 border-border pl-4 text-muted-foreground">
      {children}
    </blockquote>
  ),
  code: ({ className, children }) =>
    className?.includes("language-") ? (
      <code className="block rounded-md bg-card p-3 font-mono text-sm">{children}</code>
    ) : (
      <code className="rounded-md bg-card px-[6px] py-[1.5px] font-mono text-sm">{children}</code>
    ),
  pre: ({ children }) => <pre className="my-3 overflow-x-auto">{children}</pre>,
  table: ({ children }) => (
    <table className="my-3 w-full border-collapse border text-sm">{children}</table>
  ),
  th: ({ children }) => (
    <th className="border bg-card px-3 py-1.5 text-left font-medium">{children}</th>
  ),
  td: ({ children }) => <td className="border px-3 py-1.5">{children}</td>,
  hr: () => <hr className="my-4 border-border" />,
};
