import { useEffect } from "react";

import { SIDEBAR_SEARCH_INPUT_ID } from "./Explorer/SidebarSearchInput";
import { useNavSidebarStore, useViewerSidebarStore } from "./sidebarStores";

// Cmd/Ctrl+B toggles the nav (left) panel; on open, focuses Explorer search.
// Cmd/Ctrl+Alt+B toggles the viewer (right) panel (VS Code secondary-sidebar
// convention). Mount once at the layout. Both guard against editable focus.
export function useSidebarShortcuts() {
  useEffect(() => {
    const isEditable = (el: EventTarget | null): boolean => {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod || e.shiftKey || e.key.toLowerCase() !== "b") return;
      if (isEditable(document.activeElement)) return;

      e.preventDefault();

      if (e.altKey) {
        useViewerSidebarStore.getState().toggle();
        return;
      }

      const nav = useNavSidebarStore.getState();
      if (nav.isOpen) {
        nav.setOpen(false);
        return;
      }
      nav.setOpen(true);
      requestAnimationFrame(() => document.getElementById(SIDEBAR_SEARCH_INPUT_ID)?.focus());
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);
}
