import { animate, motion, useMotionValue } from "motion/react";
import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";

import { SIDEBAR_MIN_WIDTH, type SidebarStoreApi } from "./createSidebarStore";
import {
  SidebarContext,
  useAnnouncer,
  useBoundsRect,
  useCanvasGestureActive,
  useCanFloat,
} from "./SidebarContext";
import { SidebarResizeHandle } from "./SidebarResizeHandle";

const slug = (name: string) => name.toLowerCase().replace(/\s+/g, "-");
export const sidebarDomId = (name: string) => `${slug(name)}-sidebar`;
export const sidebarToggleId = (name: string) => `${slug(name)}-toggle`;

const focusById = (id: string) => requestAnimationFrame(() => document.getElementById(id)?.focus());

const isEditable = (el: EventTarget | null) =>
  el instanceof HTMLElement &&
  (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);

// Firefox/macOS async-pan: momentum from a gesture that ended on a preventDefault
// target (deck.gl) stays bound there and arrives non-cancelable — apply those
// deltas manually. Native sessions (cancelable start) must not be doubled.
// A quiet spell ends a session so the next event re-classifies.
const WHEEL_SESSION_GAP_MS = 250;

// combo e.g. "mod+b" (mod = Cmd/Ctrl) or "mod+shift+b".
function matchesShortcut(e: KeyboardEvent, combo: string): boolean {
  const parts = combo.toLowerCase().split("+");
  return (
    e.key.toLowerCase() === parts[parts.length - 1] &&
    parts.includes("mod") === (e.metaKey || e.ctrlKey) &&
    parts.includes("alt") === e.altKey &&
    parts.includes("shift") === e.shiftKey
  );
}

interface SidebarProps {
  /** aria-label; DOM id is derived (sidebarDomId). */
  name: string;
  side: "left" | "right";
  store: SidebarStoreApi;
  toggleShortcut?: string;
  onOpen?: () => void;
  /** Force open on mount. */
  openOnMount?: boolean;
  /** Lets Sections inside be lifted out of the panel onto the canvas. */
  floatable?: boolean;
  /** Box floated sections spawn inside; required with `floatable`. */
  boundsRef?: RefObject<HTMLElement | null>;
  children: ReactNode;
}

// Generic, dumb panel shell. Each domain owns its store (passed in); the shell
// only renders the chrome: animated width, rehydration, a hidden+clipped body,
// the resize handle, and an optional toggle shortcut.
export function Sidebar({
  name,
  side,
  store,
  toggleShortcut,
  onOpen,
  openOnMount,
  floatable = false,
  boundsRef,
  children,
}: SidebarProps) {
  const isOpen = store((s) => s.isOpen);
  const width = store((s) => s.width);
  const motionWidth = useMotionValue(isOpen ? width : 0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bounds = useBoundsRect(boundsRef);
  const canFloat = useCanFloat(floatable);
  const canvasGestureActive = useCanvasGestureActive(floatable);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const { message, announce } = useAnnouncer();
  const context = useMemo(
    () => ({
      store,
      floatable,
      bounds,
      canFloat,
      dropTargetId,
      setDropTargetId,
      announce,
      canvasGestureActive,
    }),
    [store, floatable, bounds, canFloat, dropTargetId, announce, canvasGestureActive],
  );

  // Re-clamp placements whenever the canvas box changes (and right after
  // rehydration, when bounds are first measured) so persisted rects from a
  // larger viewport stay reachable (SRS-CY-33312).
  useEffect(() => {
    if (!floatable || bounds.width === 0) return;
    store.getState().clampFloating(bounds);
  }, [floatable, bounds, store]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let session: "native" | "hijacked" | null = null;
    let lastEventAt = 0;
    const onWheel = (e: WheelEvent) => {
      if (!e.deltaY && !e.deltaX) return;
      const now = performance.now();
      if (now - lastEventAt > WHEEL_SESSION_GAP_MS) session = null;
      lastEventAt = now;
      if (e.cancelable) {
        // Native momentum — don't double it.
        session = "native";
        return;
      }
      if (session === "native") return; // native momentum — don't double it
      session = "hijacked";
      el.scrollTop += e.deltaY;
      el.scrollLeft += e.deltaX;
    };
    el.addEventListener("wheel", onWheel, { passive: true });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    // rehydrate() applies persisted state in a microtask, so force-open and the
    // width snap must run after it resolves, else persisted state clobbers
    // openOnMount and the width animates from default on load.
    void Promise.resolve(store.persist.rehydrate()).then(() => {
      if (openOnMount) store.getState().setOpen(true);
      const s = store.getState();
      motionWidth.set(s.isOpen ? s.width : 0);
    });
  }, [store, openOnMount, motionWidth]);

  useEffect(() => {
    const controls = animate(motionWidth, isOpen ? width : 0, { duration: 0.18 });
    return () => controls.stop();
  }, [isOpen, width, motionWidth]);

  useEffect(() => {
    if (!toggleShortcut) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (!matchesShortcut(e, toggleShortcut)) return;
      if (isEditable(document.activeElement)) return;
      e.preventDefault();
      const s = store.getState();
      if (s.isOpen) {
        s.setOpen(false);
        focusById(sidebarToggleId(name)); // don't strand focus in the hidden panel
      } else {
        s.setOpen(true);
        // Double rAF: wait for the re-render that unhides the body, else focus() is a no-op.
        if (onOpen) requestAnimationFrame(() => requestAnimationFrame(onOpen));
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [toggleShortcut, store, name, onOpen]);

  // Hide/show every floating panel at once (SRS-CY-33315). Bound to the shell
  // so it works with any focus; suppressed while typing.
  useEffect(() => {
    if (!floatable) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (!matchesShortcut(e, "mod+shift+f")) return;
      if (isEditable(document.activeElement)) return;
      e.preventDefault();
      const hidden = !store.getState().floatsHidden;
      store.getState().setFloatsHidden(hidden);
      announce(hidden ? "Floating panels hidden" : "Floating panels shown");
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [floatable, store, announce]);

  return (
    <motion.aside
      id={sidebarDomId(name)}
      aria-label={name}
      data-theme="dark"
      style={{ width: motionWidth }}
      className="relative shrink-0 border-border bg-background text-foreground"
    >
      {/* Clip on this wrapper (not the aside) so the resize handle below stays
          interactive and unclipped when the panel is closed. A closed body is
          hidden rather than inert so descendants that escape the panel — a
          floated section — can opt back in with `visibility: visible`. */}
      <div
        className="h-full w-full overflow-hidden"
        style={{ visibility: isOpen ? undefined : "hidden" }}
      >
        <div
          ref={scrollRef}
          className="flex h-full flex-col overflow-auto pb-60"
          style={{ minWidth: SIDEBAR_MIN_WIDTH }}
        >
          <SidebarContext.Provider value={context}>{children}</SidebarContext.Provider>
        </div>
      </div>

      {/* Outside the hidden body so announcements land while the sidebar is closed. */}
      <div role="status" aria-live="polite" className="sr-only">
        {message}
      </div>

      <SidebarResizeHandle
        store={store}
        side={side}
        motionWidth={motionWidth}
        toggleShortcut={toggleShortcut}
      />
    </motion.aside>
  );
}
