import { useEffect } from "react";

import { SIDEBAR_SEARCH_INPUT_ID } from "./Explorer/SidebarSearchInput";
import { useLayoutStore } from "~/components/DirectoryView/useLayoutStore";

// Cmd/Ctrl+B toggles the panel; on open, focuses Explorer search. Mount once.
export function useSidebarShortcuts() {
  useEffect(() => {
    const isEditable = (el: EventTarget | null): boolean => {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const isToggle = (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "b";
      if (!isToggle) return;
      if (isEditable(document.activeElement)) return;

      e.preventDefault();
      const { sidebarOpen, setSidebarOpen, setSidebarTab } = useLayoutStore.getState();

      if (sidebarOpen) {
        setSidebarOpen(false);
        return;
      }

      setSidebarTab("explorer");
      setSidebarOpen(true);
      requestAnimationFrame(() => {
        document.getElementById(SIDEBAR_SEARCH_INPUT_ID)?.focus();
      });
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);
}
