import { useLayoutStore } from "~/components/DirectoryView/useLayoutStore";
import { useNavSidebarStore } from "~/components/Sidebar/sidebarStores";

const NEXT_FRAME_MS = 220;
const ROUTE_SETTLE_MS = 400;
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

/**
 * Navigates to the first link matching `selector`, waiting for it to appear
 * first. Used by steps that must move the user into a connection before later
 * targets exist — on the home screen the breadcrumb has no trail and the
 * view-mode toggle is absent, so those steps would otherwise highlight nothing.
 */
export async function navigateToFirstMatch(
  selector: string,
  navigate: (to: string) => void,
  timeoutMs = 5000,
): Promise<void> {
  await waitForTarget([selector], timeoutMs);
  const href = document.querySelector<HTMLAnchorElement>(selector)?.getAttribute("href");
  if (!href || window.location.pathname === href) return;
  navigate(href);
  await sleep(ROUTE_SETTLE_MS);
}

/**
 * Scrolls the nearest scrollable ancestor so `selector` is centered within it.
 * The viewer's control panel scrolls independently of the page, so a step
 * targeting something below its fold (the display-settings section) would
 * otherwise highlight an off-screen element.
 */
export async function revealInScrollContainer(selector: string): Promise<void> {
  const element = document.querySelector(selector);
  if (!element) return;

  let container = element.parentElement;
  while (container && container !== document.body) {
    const { overflowY } = getComputedStyle(container);
    const scrolls = overflowY === "auto" || overflowY === "scroll";
    if (scrolls && container.scrollHeight > container.clientHeight) {
      const elementRect = element.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const centeredOffset =
        elementRect.top - containerRect.top - (container.clientHeight - elementRect.height) / 2;
      container.scrollTop += centeredOffset;
      await sleep(NEXT_FRAME_MS);
      return;
    }
    container = container.parentElement;
  }
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
