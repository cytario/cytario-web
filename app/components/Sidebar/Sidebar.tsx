import { animate, motion, useMotionValue } from "motion/react";
import { useEffect, type ReactNode } from "react";
import { twMerge } from "tailwind-merge";

import { SIDEBAR_MIN_WIDTH, type SidebarStoreApi } from "./createSidebarStore";
import { SidebarResizeHandle } from "./SidebarResizeHandle";

/** Human-facing names — single source for aria-label + derived DOM ids. */
export const SIDEBAR = { nav: "Navigation", viewer: "Image controls" } as const;

const slug = (name: string) => name.toLowerCase().replace(/\s+/g, "-");
export const sidebarDomId = (name: string) => `${slug(name)}-sidebar`;
export const sidebarToggleId = (name: string) => `${slug(name)}-toggle`;

const focusById = (id: string) => requestAnimationFrame(() => document.getElementById(id)?.focus());

const isEditable = (el: EventTarget | null) =>
  el instanceof HTMLElement &&
  (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);

// combo e.g. "mod+b" (mod = Cmd/Ctrl) or "mod+alt+b".
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
  /** Self-registered global toggle, e.g. "mod+b". Guarded against editable focus. */
  toggleShortcut?: string;
  /** Called after a shortcut-driven open (e.g. focus the search input). */
  onOpen?: () => void;
  /** Force open on mount (viewer: controls visible on arrival). */
  openOnMount?: boolean;
  children: ReactNode;
}

// Generic, dumb panel shell. Each domain owns its store (passed in); the shell
// only renders the chrome: animated width, rehydration, an inert+clipped body,
// the resize handle, and an optional toggle shortcut.
export function Sidebar({
  name,
  side,
  store,
  toggleShortcut,
  onOpen,
  openOnMount,
  children,
}: SidebarProps) {
  const isOpen = store((s) => s.isOpen);
  const width = store((s) => s.width);
  const motionWidth = useMotionValue(isOpen ? width : 0);

  useEffect(() => {
    // rehydrate() applies persisted state in a microtask, so force-open and the
    // width snap must run *after* it resolves — otherwise persisted state would
    // clobber openOnMount, and the width would animate from default → stored on
    // load. Snapping (set, not animate) lands the rehydrated size before paint.
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
        focusById(sidebarToggleId(name)); // don't strand focus in the inert panel
      } else {
        s.setOpen(true);
        // Double rAF: wait for the re-render that lifts `inert` to commit before
        // focusing, else focus() on the still-inert input is a no-op.
        if (onOpen) requestAnimationFrame(() => requestAnimationFrame(onOpen));
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [toggleShortcut, store, name, onOpen]);

  return (
    <motion.aside
      id={sidebarDomId(name)}
      aria-label={name}
      data-theme="dark"
      style={{ width: motionWidth }}
      className={twMerge(
        "relative shrink-0 border-border bg-background text-foreground",
        side === "left" ? "border-r" : "border-l",
      )}
    >
      {/* inert + clip on this wrapper (not the aside) so the resize handle below
          stays interactive and unclipped when the panel is closed. */}
      <div className="h-full w-full overflow-hidden" inert={!isOpen || undefined}>
        <div className="flex h-full flex-col overflow-auto" style={{ minWidth: SIDEBAR_MIN_WIDTH }}>
          {children}
        </div>
      </div>

      <SidebarResizeHandle store={store} side={side} motionWidth={motionWidth} />
    </motion.aside>
  );
}
