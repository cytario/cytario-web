import { json } from "@codemirror/lang-json";
import { yaml } from "@codemirror/lang-yaml";
import { Button } from "@cytario/design";
import CodeMirror, { EditorView } from "@uiw/react-codemirror";
import { useCallback, useEffect, useMemo, useState } from "react";

import { readTextFile } from "./readText";
import { writeTextFile } from "./writeText";
import { getExtension } from "~/utils/fileType";
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

export function TextEditor({ resourceId, signedFetch }: TextEditorProps) {
  const [content, setContent] = useState("");
  const [originalContent, setOriginalContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const ext = getExtension(resourceId);
  const extensions = useMemo(() => [EditorView.lineWrapping, ...languageExtensions(ext)], [ext]);

  const dirty = content !== originalContent;

  // Initial state `loading=true` covers the first render. The route passes
  // `key={resourceId}` so the component remounts (re-entering `loading=true`)
  // when the resource changes — no synchronous setState needed in the effect.
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

  // Cmd/Ctrl+S to save
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (dirty && !saving) handleSave();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [dirty, saving, handleSave]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">Loading…</div>
    );
  }

  if (error && !content) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
        <p className="text-sm text-red-600">{error}</p>
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
        <span className="text-sm text-muted-foreground">
          {dirty ? "Unsaved changes" : "All changes saved"}
        </span>
        <div className="flex items-center gap-2">
          {error && <span className="text-sm text-red-600">{error}</span>}
          <Button onPress={handleSave} isDisabled={!dirty || saving} variant="secondary">
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </header>
      <div className="flex-1 overflow-auto">
        <CodeMirror value={content} onChange={setContent} extensions={extensions} height="100%" />
      </div>
    </div>
  );
}
