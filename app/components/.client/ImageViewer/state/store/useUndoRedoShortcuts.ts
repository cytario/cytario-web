import { useEffect } from "react";

import { useUndoRedo } from "./useUndoRedo";

/**
 * Global keyboard shortcuts for annotation undo/redo:
 *
 * - **Cmd/Ctrl+Z** — undo
 * - **Shift+Cmd/Ctrl+Z** or **Cmd/Ctrl+Y** — redo
 *
 * Suppressed when the user is typing in a text input, textarea, or
 * content-editable region (so editing an annotation label doesn't trigger
 * the browser's native undo). The hook is viewer-scoped: mount it once per
 * `ViewerStoreProvider` and it operates on that viewer's history.
 */
export const useUndoRedoShortcuts = () => {
  const { undo, redo, canUndo, canRedo } = useUndoRedo();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable) {
        return;
      }

      const mod = e.metaKey || e.ctrlKey;
      if (!mod || e.key.toLowerCase() !== "z") {
        if (!mod || e.key.toLowerCase() !== "y") return;
        // Cmd/Ctrl+Y → redo
        e.preventDefault();
        if (canRedo) redo();
        return;
      }

      e.preventDefault();
      if (e.shiftKey) {
        if (canRedo) redo();
      } else {
        if (canUndo) undo();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [undo, redo, canUndo, canRedo]);
};
