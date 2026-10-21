import { Button } from "@cytario/design";
import { useCallback, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { loadMarkdownDocument } from "./loadMarkdown";
import { LoaderView } from "../Loader/LoaderView";
import { TextEditor } from "../TextEditor/TextEditor";
import type { SignedFetch } from "~/utils/signedFetch";

interface MarkdownViewerProps {
  resourceId: string;
  signedFetch: SignedFetch;
}

/**
 * Formatted Markdown renderer for `.md` / `.markdown` objects. Raw HTML in
 * the source renders as literal text (no rehype-raw), so untrusted markup is
 * never executed. Edit mode mounts the existing Text Editor unchanged.
 */
export const MarkdownViewer = ({ resourceId, signedFetch }: MarkdownViewerProps) => {
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [editMode, setEditMode] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadMarkdownDocument(resourceId, signedFetch)
      .then((source) => {
        if (!cancelled) setMarkdown(source);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [resourceId, signedFetch, reloadKey]);

  const handleRetry = useCallback(() => {
    setMarkdown(null);
    setError(null);
    setLoading(true);
    setReloadKey((key) => key + 1);
  }, []);

  if (loading) {
    return <LoaderView label="Loading document…" />;
  }

  if (error !== null) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-foreground">{error}</p>
        <Button variant="secondary" onPress={handleRetry}>
          Retry
        </Button>
      </div>
    );
  }

  if (markdown === null) {
    return null;
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b px-4 py-2">
        <span className="text-sm text-muted-foreground">Markdown</span>
        <Button variant="secondary" onPress={() => setEditMode((editing) => !editing)}>
          {editMode ? "Preview" : "Edit"}
        </Button>
      </header>
      {editMode ? (
        <TextEditor resourceId={resourceId} signedFetch={signedFetch} />
      ) : (
        <div className="flex-1 overflow-auto px-6 py-4 text-foreground">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
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
              h1: ({ children }) => (
                <h1 className="mt-6 mb-3 text-2xl font-semibold">{children}</h1>
              ),
              h2: ({ children }) => <h2 className="mt-6 mb-2 text-xl font-semibold">{children}</h2>,
              h3: ({ children }) => <h3 className="mt-4 mb-2 text-lg font-semibold">{children}</h3>,
              p: ({ children }) => <p className="my-3 text-sm leading-6">{children}</p>,
              ul: ({ children }) => (
                <ul className="my-3 list-disc space-y-1 pl-6 text-sm">{children}</ul>
              ),
              ol: ({ children }) => (
                <ol className="my-3 list-decimal space-y-1 pl-6 text-sm">{children}</ol>
              ),
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
                  <code className="rounded-md bg-card px-[6px] py-[1.5px] font-mono text-sm">
                    {children}
                  </code>
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
            }}
          >
            {markdown}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
};
