import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { CSSProperties, RefObject } from "react";
import { useStore } from "zustand";

import {
  clampFloatRect,
  createSidebarStore,
  FLOAT_INSET,
  FLOAT_MIN_VIEWPORT_WIDTH,
  FLOAT_PANEL_WIDTH,
  FLOAT_Z_BASE,
  FLOAT_Z_RANGE,
  nextFloatRect,
  offsetFloatRect,
  type BoundsBox,
  type FloatRect,
  type SidebarStoreApi,
} from "./createSidebarStore";

export const FLOATING_PANEL_ATTR = "data-floating-panel";

/** True while `el` sits inside a floating panel — the guard for viewer-global key handling. */
export function isInsideFloatingPanel(el: Element | null): boolean {
  return Boolean(el?.closest?.(`[${FLOATING_PANEL_ATTR}]`));
}

export interface BoundsRect extends BoundsBox {
  left: number;
  top: number;
}

export interface SidebarContextValue {
  store: SidebarStoreApi;
  /** Sections inside may be lifted out onto the canvas. */
  floatable: boolean;
  /** Measured box a floated panel lives in; positions are stored relative to it. */
  bounds: BoundsRect;
  /** False below the narrow-viewport threshold, where floating is not offered. */
  canFloat: boolean;
  /** Section whose placeholder row is the current drop target of a dock drag. */
  dropTargetId: string | null;
  setDropTargetId: (sectionId: string | null) => void;
  /** Speaks through the shell's single polite live region. */
  announce: (message: string) => void;
  /** A pointer gesture owned by the surface beneath is running; panels let it through. */
  canvasGestureActive: boolean;
}

export const SidebarContext = createContext<SidebarContextValue | null>(null);

const ZERO_BOUNDS: BoundsRect = { left: 0, top: 0, width: 0, height: 0 };

export function useBoundsRect(ref: RefObject<HTMLElement | null> | undefined): BoundsRect {
  const [bounds, setBounds] = useState<BoundsRect>(ZERO_BOUNDS);

  useEffect(() => {
    const el = ref?.current;
    if (!el) return;
    const read = () => {
      const { left, top, width, height } = el.getBoundingClientRect();
      setBounds((prev) =>
        prev.left === left && prev.top === top && prev.width === width && prev.height === height
          ? prev
          : { left, top, width, height },
      );
    };
    read();
    const observer =
      typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(() => read());
    observer?.observe(el);
    window.addEventListener("resize", read);
    window.addEventListener("scroll", read, true);
    document.addEventListener("fullscreenchange", read);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", read);
      window.removeEventListener("scroll", read, true);
      document.removeEventListener("fullscreenchange", read);
    };
  }, [ref]);

  return bounds;
}

/** Tracks the viewport against the narrow-viewport threshold. */
export function useCanFloat(enabled: boolean): boolean {
  const [wide, setWide] = useState(true);

  useEffect(() => {
    if (!enabled) return;
    const read = () => setWide(window.innerWidth >= FLOAT_MIN_VIEWPORT_WIDTH);
    read();
    window.addEventListener("resize", read);
    return () => window.removeEventListener("resize", read);
  }, [enabled]);

  return enabled && wide;
}

/** True between pointerdown outside any panel and its pointerup. */
export function useCanvasGestureActive(enabled: boolean): boolean {
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const onDown = (e: PointerEvent) => {
      if (!isInsideFloatingPanel(e.target as Element | null)) setActive(true);
    };
    const stop = () => setActive(false);
    window.addEventListener("pointerdown", onDown, { capture: true });
    window.addEventListener("pointerup", stop, { capture: true });
    window.addEventListener("pointercancel", stop, { capture: true });
    return () => {
      window.removeEventListener("pointerdown", onDown, { capture: true });
      window.removeEventListener("pointerup", stop, { capture: true });
      window.removeEventListener("pointercancel", stop, { capture: true });
    };
  }, [enabled]);

  return active;
}

export interface SectionHandle {
  isFloating: boolean;
  /** Docked accordion state — held while floating and restored on dock. */
  isOpen: boolean;
  /** Hidden by the hide-all-floats toggle; still floating, just not rendered. */
  isHidden: boolean;
  /** A dock drag is hovering this section's placeholder row. */
  isDropTarget: boolean;
  /** Whether this sidebar offers floating at all — the control's existence. */
  floatable: boolean;
  /** False below the narrow-viewport threshold — the control disables. */
  canFloat: boolean;
  bounds: BoundsRect;
  rect: FloatRect | null;
  /** Viewport-fixed placement while floating; undefined when docked. */
  style?: CSSProperties;
  toggleOpen: () => void;
  float: () => void;
  dock: () => void;
  moveTo: (rect: FloatRect) => void;
  moveBy: (dx: number, dy: number) => void;
  bringToFront: () => void;
  setDropTarget: (over: boolean) => void;
  announce: (message: string) => void;
}

// Keeps useSectionHandle's hook order stable where there is no sidebar context.
const detachedStore = createSidebarStore({ name: "Sidebar (detached)" });

/** Section state (accordion + floating) for one section, or null outside a Sidebar. */
export function useSectionHandle(sectionId: string): SectionHandle | null {
  const context = useContext(SidebarContext);
  const store = context?.store ?? detachedStore;
  const entry = useStore(store, (s) => s.sections[sectionId]);
  const floatsHidden = useStore(store, (s) => s.floatsHidden);

  return useMemo(() => {
    if (!context) return null;
    const { bounds, canFloat, dropTargetId, setDropTargetId, announce, floatable } = context;
    const isFloating = Boolean(entry?.rect);
    const zIndex = FLOAT_Z_BASE + Math.min(entry?.z ?? 0, FLOAT_Z_RANGE);
    return {
      isFloating,
      isOpen: entry?.isOpen ?? true,
      isHidden: isFloating && floatsHidden,
      isDropTarget: dropTargetId === sectionId,
      floatable,
      canFloat,
      bounds,
      rect: entry?.rect ?? null,
      style: entry?.rect
        ? {
            position: "fixed",
            left: bounds.left + entry.rect.x,
            top: bounds.top + entry.rect.y,
            width: entry.rect.width,
            // Cap at the canvas slice below the panel's own top so a tall
            // panel never outgrows the bounds box; the panel scrolls itself.
            maxHeight: bounds.height > 0 ? bounds.height - entry.rect.y - FLOAT_INSET : undefined,
            zIndex,
            // Re-declared so a panel survives the collapsed sidebar's hidden body.
            visibility: floatsHidden ? "hidden" : "visible",
          }
        : undefined,
      toggleOpen: () => store.getState().toggleSection(sectionId),
      float: () => {
        const state = store.getState();
        const count = Object.values(state.sections).filter((s) => s.rect).length;
        state.float(sectionId, nextFloatRect(bounds, FLOAT_PANEL_WIDTH, count));
      },
      dock: () => store.getState().dock(sectionId),
      moveTo: (rect) => store.getState().move(sectionId, clampFloatRect(rect, bounds)),
      moveBy: (dx, dy) => {
        const current = store.getState().sections[sectionId];
        if (!current?.rect) return;
        store
          .getState()
          .move(sectionId, clampFloatRect(offsetFloatRect(current.rect, dx, dy), bounds));
      },
      bringToFront: () => store.getState().bringToFront(sectionId),
      setDropTarget: (over) => setDropTargetId(over ? sectionId : null),
      announce,
    };
  }, [context, entry, floatsHidden, sectionId, store]);
}

/** Shell-side announcer: one polite live region per sidebar. */
export function useAnnouncer() {
  const [message, setMessage] = useState("");
  const announce = useCallback((next: string) => {
    // Re-announce an identical message by breaking the text first.
    setMessage((prev) => (prev === next ? `${next} ` : next));
  }, []);
  return { message, announce };
}
