import { useEffect } from "react";

import { useUndoRedo } from "./useUndoRedo";

/** Global Cmd/Ctrl+Z (undo) and Shift+Cmd/Ctrl+Z / Cmd/Ctrl+Y (redo) shortcuts,
 *  suppressed while typing in inputs so text editing uses the browser's native undo. */
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
