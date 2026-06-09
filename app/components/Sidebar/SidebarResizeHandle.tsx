import { motion, type MotionValue } from "motion/react";

import {
  clampSidebarWidth,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  useLayoutStore,
} from "~/components/DirectoryView/useLayoutStore";

// Ported from the FeatureBar drag handle: drag the right edge to resize; drop
// below half the min width to close (stored width is kept for re-open).
export function SidebarResizeHandle({ motionWidth }: { motionWidth: MotionValue<number> }) {
  const setSidebarWidth = useLayoutStore((s) => s.setSidebarWidth);
  const setSidebarOpen = useLayoutStore((s) => s.setSidebarOpen);

  return (
    <motion.div
      drag="x"
      dragMomentum={false}
      dragConstraints={{ left: 0, right: SIDEBAR_MAX_WIDTH }}
      style={{ x: motionWidth }}
      onDragEnd={() => {
        const w = motionWidth.get();
        if (w < SIDEBAR_MIN_WIDTH / 2) {
          setSidebarOpen(false);
          return;
        }
        const clamped = clampSidebarWidth(w);
        setSidebarWidth(clamped);
        motionWidth.set(clamped);
      }}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize navigation panel"
      className="absolute top-0 left-0 z-10 h-full w-2 -translate-x-1/2 cursor-ew-resize hover:bg-(--color-border-strong)"
    />
  );
}
