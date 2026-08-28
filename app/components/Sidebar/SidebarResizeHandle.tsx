import { animate, motion, type MotionValue, type PanInfo } from "motion/react";
import { useRef } from "react";
import { twMerge } from "tailwind-merge";

import {
  clampSidebarWidth,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  type SidebarStoreApi,
} from "./createSidebarStore";

interface SidebarResizeHandleProps {
  store: SidebarStoreApi;
  side: "left" | "right";
  motionWidth: MotionValue<number>;
}

const KEYBOARD_STEP = 24;
const DOUBLE_TAP_MS = 300;

// A child of the panel `<aside>`, positioned at its inner edge and extending
// outward over the content. The aside's width *is* the panel width, so `right-0`
// (left) / `left-0` (right) ride the edge with no transform of our own. The
// aside keeps `inert`/`overflow-hidden` on an inner wrapper — not itself — so
// this handle stays interactive and unclipped when the panel is closed
// (width 0), enabling drag-to-open. Drives the live width through `motionWidth`
// (no re-render per frame); framer `onPan` reports the gesture without moving
// the element.
export function SidebarResizeHandle({ store, side, motionWidth }: SidebarResizeHandleProps) {
  const setWidth = store((s) => s.setWidth);
  const setOpen = store((s) => s.setOpen);
  const toggle = store((s) => s.toggle);
  const isOpen = store((s) => s.isOpen);
  const width = store((s) => s.width);
  const dir = side === "left" ? 1 : -1;
  const widthAtPanStart = useRef(0);
  const lastTap = useRef(0);

  // Drive motionWidth here rather than relying on the panel's open/width effect:
  // a drag that leaves isOpen/width unchanged (e.g. nudging an already-closed
  // panel) wouldn't re-run it, leaving the panel stuck mid-drag.
  const commit = (w: number) => {
    const close = w < SIDEBAR_MIN_WIDTH / 2;
    const target = close ? 0 : clampSidebarWidth(w);
    setOpen(!close);
    if (!close) setWidth(target);
    animate(motionWidth, target, { duration: 0.18 });
  };

  const onPan = (_e: PointerEvent, info: PanInfo) => {
    const next = widthAtPanStart.current + info.offset.x * dir;
    motionWidth.set(Math.max(0, Math.min(SIDEBAR_MAX_WIDTH, next)));
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // Grow toward the content, shrink toward the edge (mirrored per side).
    const grow = side === "left" ? "ArrowRight" : "ArrowLeft";
    const shrink = side === "left" ? "ArrowLeft" : "ArrowRight";
    if (e.key !== grow && e.key !== shrink) return;
    e.preventDefault();
    // `width` is the stored width (retained while closed). Grow from closed
    // reopens at it; shrink while closed is a no-op.
    if (e.key === grow) commit(isOpen ? width + KEYBOARD_STEP : width);
    else if (isOpen) commit(width - KEYBOARD_STEP);
  };

  const cx = twMerge(
    `
      z-30 cursor-ew-resize
      absolute top-0 
      h-full w-4 
      border-transparent
      hover:border-secondary
      transition-colors
    `,
    side === "left" ? "right-0 translate-x-full border-l-4" : "left-0 -translate-x-full border-r-4",
  );

  return (
    <motion.div
      onPanStart={() => (widthAtPanStart.current = motionWidth.get())}
      onPan={onPan}
      onPanEnd={() => commit(motionWidth.get())}
      onTap={() => {
        const now = Date.now();
        if (now - lastTap.current < DOUBLE_TAP_MS) toggle();
        lastTap.current = now;
      }}
      onKeyDown={onKeyDown}
      tabIndex={0}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize panel"
      aria-valuenow={Math.round(isOpen ? width : 0)}
      aria-valuemin={0}
      aria-valuemax={SIDEBAR_MAX_WIDTH}
      className={cx}
    />
  );
}
