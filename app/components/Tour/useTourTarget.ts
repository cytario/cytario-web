import { useLayoutStore } from "~/components/DirectoryView/useLayoutStore";
import { useNavSidebarStore } from "~/components/Sidebar/sidebarStores";

const NEXT_FRAME_MS = 220;
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Normalises persisted UI state so a tour's targets are visible: opens the
 * navigation sidebar and expands the Connections section. Side effects on the
 * browser's persisted layout are acceptable — a tour is an explicit action.
 * Only the state writes and one frame-settle happen here — target readiness is
 * the caller's (the step's own target wait).
 */
export async function normaliseAppShell(): Promise<void> {
  const navSidebar = useNavSidebarStore.getState();
  if (!navSidebar.isOpen) navSidebar.setOpen(true);

  const connectionsOpen = navSidebar.sections.connections?.isOpen ?? true;
  if (!connectionsOpen) {
    navSidebar.toggleSection("connections");
  }

  // One frame for the width animation + re-render before the caller's selectors run.
  await sleep(NEXT_FRAME_MS);
}

/** Sets the persisted view mode so grid-mode targets (file card links) exist. */
export function setGridViewMode(): void {
  const { viewMode, setViewMode } = useLayoutStore.getState();
  if (viewMode !== "grid") setViewMode("grid");
}

/** Waits for one of the given selectors to appear in the document. */
export async function waitForTarget(selectors: string[], timeoutMs = 15000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const selector of selectors) {
      if (document.querySelector(selector)) return;
    }
    await sleep(100);
  }
}
