import { Tooltip } from "@cytario/design";
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
  toggleShortcut?: string;
}

const KEYBOARD_STEP = 24;

function formatShortcut(combo: string): string {
  const mod = /Mac|iPod|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl";
  return combo
    .split("+")
    .map((p) => ({ mod, alt: "⌥", shift: "⇧" })[p] ?? p.toUpperCase())
    .join("");
}

// Positioned at the aside's inner edge, extending over the content; visibility/
// overflow-hidden live on an inner wrapper so the handle stays interactive at
// width 0 (drag-to-open). motionWidth avoids a re-render per frame.
export function SidebarResizeHandle({
  store,
  side,
  motionWidth,
  toggleShortcut,
}: SidebarResizeHandleProps) {
  const setWidth = store((s) => s.setWidth);
  const setOpen = store((s) => s.setOpen);
  const toggle = store((s) => s.toggle);
  const isOpen = store((s) => s.isOpen);
  const width = store((s) => s.width);
  const dir = side === "left" ? 1 : -1;
  const widthAtPanStart = useRef(0);

  // Drive motionWidth here, not in the panel's open/width effect: a drag that
  // leaves isOpen/width unchanged wouldn't re-run it, sticking mid-drag.
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
    // `width` is retained while closed: grow from closed reopens at it.
    if (e.key === grow) commit(isOpen ? width + KEYBOARD_STEP : width);
    else if (isOpen) commit(width - KEYBOARD_STEP);
  };

  const cx = twMerge(
    `
      z-30 cursor-ew-resize
      absolute top-0 
      h-full w-4 
      border-transparent
      hover:border-secondary focus:border-secondary
      transition-colors
    `,
    side === "left" ? "right-0 translate-x-full border-l-4" : "left-0 -translate-x-full border-r-4",
  );

  const tooltip = toggleShortcut
    ? `Double-click to toggle · ${formatShortcut(toggleShortcut)}`
    : "Double-click to toggle";

  return (
    <Tooltip content={tooltip}>
      <motion.div
        onPanStart={() => (widthAtPanStart.current = motionWidth.get())}
        onPan={onPan}
        onPanEnd={() => commit(motionWidth.get())}
        onDoubleClick={toggle}
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
    </Tooltip>
  );
}
