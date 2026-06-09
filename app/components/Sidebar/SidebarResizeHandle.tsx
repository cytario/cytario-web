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
export function SidebarResizeHandle({ store, side, motionWidth }: SidebarResizeHandleProps) {
  const setWidth = store((s) => s.setWidth);
  const setOpen = store((s) => s.setOpen);
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

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    const w = motionWidth.get();
    if (w < SIDEBAR_MIN_WIDTH / 2) {
      setOpen(false);
      return;
    }
    setOpen(true);
    const clamped = clampSidebarWidth(w);
    setWidth(clamped);
    motionWidth.set(clamped);
  };

  return (
    <motion.div
      style={{ x }}
      onPointerDown={(e) => e.currentTarget.setPointerCapture(e.pointerId)}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize panel"
      className={`absolute top-0 z-30 h-full w-4 cursor-ew-resize hover:bg-slate-400/40 ${
        side === "left" ? "left-0" : "right-0"
      }`}
    />
  );
}
