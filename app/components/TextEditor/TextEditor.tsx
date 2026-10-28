import { json } from "@codemirror/lang-json";
import { yaml } from "@codemirror/lang-yaml";
import { Banner, Button } from "@cytario/design";
import CodeMirror, { EditorView } from "@uiw/react-codemirror";
import { useCallback, useEffect, useMemo, useState } from "react";

import { FormattedTextView } from "./FormattedTextView";
import { PlainTextView } from "./PlainTextView";
import { readTextFile } from "./readText";
import { writeTextFile } from "./writeText";
import { useCanWrite } from "~/components/.client/ImageViewer/utils/useCanAnnotate";
import { getFileType, getExtension } from "~/utils/fileType";
import type { SignedFetch } from "~/utils/signedFetch";

interface TextEditorProps {
  resourceId: string;
  signedFetch: SignedFetch;
}

function languageExtensions(ext: string | undefined) {
  switch (ext) {
    case "json":
    case "ndjson":
      return [json()];
    case "yaml":
    case "yml":
      return [yaml()];
    default:
      return [];
  }
}

const MARKDOWN_TYPES = new Set(["Markdown", "Quarto Markdown"]);

/** Files with a formatted view mode; everything else views as plain text. */
function isFormattedTextType(type: string): boolean {
  return MARKDOWN_TYPES.has(type);
}

export function TextEditor({ resourceId, signedFetch }: TextEditorProps) {
  const [content, setContent] = useState("");
  const [originalContent, setOriginalContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);

  const ext = getExtension(resourceId);
  const extensions = useMemo(() => [EditorView.lineWrapping, ...languageExtensions(ext)], [ext]);
  const formatted = isFormattedTextType(getFileType(resourceId));
  // S3 remains the enforcement boundary; this only keeps the UI from offering
  // an edit that cannot persist on a read-only connection.
  const canWrite = useCanWrite(resourceId);

  const dirty = content !== originalContent;

  // Route remounts via key={resourceId} when the resource changes, so no sync setState needed.
  useEffect(() => {
    let cancelled = false;
    readTextFile(resourceId)
      .then((text) => {
        if (cancelled) return;
        setContent(text);
        setOriginalContent(text);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [resourceId]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      await writeTextFile(resourceId, content, signedFetch);
      setOriginalContent(content);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }, [resourceId, content, signedFetch]);

  // Cmd/Ctrl+S to save — never on a read-only connection.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (canWrite && dirty && !saving) handleSave();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [canWrite, dirty, saving, handleSave]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">Loading…</div>
    );
  }

  if (error && !content) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
        <Banner variant="danger" className="max-w-xl text-left">
          {error}
        </Banner>
        <Button
          onPress={() => {
            setError(null);
            setLoading(true);
            readTextFile(resourceId)
              .then((text) => {
                setContent(text);
                setOriginalContent(text);
              })
              .catch((err) => {
                setError(err instanceof Error ? err.message : String(err));
              })
              .finally(() => setLoading(false));
          }}
        >
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b px-4 py-2">
        {dirty || editMode ? (
          <span className="text-sm text-muted-foreground">
            {dirty ? "Unsaved changes" : "All changes saved"}
          </span>
        ) : null}
        <div className="flex items-center gap-2">
          {error && <span className="text-sm text-destructive">{error}</span>}
          {editMode && (
            <Button
              onPress={handleSave}
              isDisabled={!dirty || saving || !canWrite}
              variant="secondary"
            >
              {saving ? "Saving…" : "Save"}
            </Button>
          )}
          {canWrite && (
            <Button variant="secondary" onPress={() => setEditMode((editing) => !editing)}>
              {editMode ? "Back to view" : "Edit"}
            </Button>
          )}
        </div>
      </header>
      {editMode ? (
        <div className="flex-1 overflow-auto">
          <CodeMirror value={content} onChange={setContent} extensions={extensions} height="100%" />
        </div>
      ) : formatted ? (
        <FormattedTextView markdown={content} />
      ) : (
        <PlainTextView text={content} />
      )}
    </div>
  );
}
