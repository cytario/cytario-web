interface PlainTextViewProps {
  text: string;
}

/**
 * Plain-text view mode for sources with no formatted rendering (JSON, YAML,
 * TXT): preformatted, wrap-free, monospace.
 */
export function PlainTextView({ text }: PlainTextViewProps) {
  return (
    <div className="flex-1 overflow-auto px-6 py-4">
      <pre className="whitespace-pre-wrap font-mono text-sm text-foreground">{text}</pre>
    </div>
  );
}
