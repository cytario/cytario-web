import { motion, type MotionValue, useTransform } from "motion/react";
import { type StoreApi, type UseBoundStore } from "zustand";

import {
  clampSidebarWidth,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  type SidebarStore,
} from "./createSidebarStore";

interface SidebarResizeHandleProps {
  store: UseBoundStore<StoreApi<SidebarStore>>;
  side: "left" | "right";
  motionWidth: MotionValue<number>;
}

// Lives OUTSIDE the panel, riding its inner edge, so it stays interactive even
// when the panel is closed (width 0): drag toward the content to open/resize,
// drag past the threshold back toward the edge to close. Width is derived from
// the pointer position relative to the positioned container, mirrored per side.
const KEYBOARD_STEP = 24;

export function SidebarResizeHandle({ store, side, motionWidth }: SidebarResizeHandleProps) {
  const setWidth = store((s) => s.setWidth);
  const setOpen = store((s) => s.setOpen);
  const isOpen = store((s) => s.isOpen);
  const width = store((s) => s.width);
  // Handle sits flush just OUTSIDE the panel edge, overlaying the viewer: the
  // left panel's handle extends right (anchored left:0, x = +width), the right
  // panel's extends left (anchored right:0, x = -width). Motion writes
  // `transform` inline, so no Tailwind translate is used.
  const x = useTransform(motionWidth, (w) => (side === "left" ? w : -w));

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const parent = e.currentTarget.offsetParent as HTMLElement | null;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    const raw = side === "left" ? e.clientX - rect.left : rect.right - e.clientX;
    motionWidth.set(Math.max(0, Math.min(SIDEBAR_MAX_WIDTH, raw)));
  };

  const commit = (w: number) => {
    if (w < SIDEBAR_MIN_WIDTH / 2) {
      setOpen(false);
      return;
    }
    setOpen(true);
    const clamped = clampSidebarWidth(w);
    setWidth(clamped);
    motionWidth.set(clamped);
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    commit(motionWidth.get());
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // Grow toward the content, shrink toward the edge (mirrored per side).
    const grow = side === "left" ? "ArrowRight" : "ArrowLeft";
    const shrink = side === "left" ? "ArrowLeft" : "ArrowRight";
    if (e.key !== grow && e.key !== shrink) return;
    e.preventDefault();
    const base = isOpen ? width : 0;
    commit(base + (e.key === grow ? KEYBOARD_STEP : -KEYBOARD_STEP));
  };

  return (
    <motion.div
      style={{ x }}
      onPointerDown={(e) => e.currentTarget.setPointerCapture(e.pointerId)}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={onKeyDown}
      tabIndex={0}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize panel"
      aria-valuenow={Math.round(isOpen ? width : 0)}
      aria-valuemin={0}
      aria-valuemax={SIDEBAR_MAX_WIDTH}
      className={`absolute top-0 z-30 h-full w-4 cursor-ew-resize hover:bg-slate-400/40 ${
        side === "left" ? "left-0" : "right-0"
      }`}
    />
  );
}
