import { animate, motion, useMotionValue } from "motion/react";
import { useEffect } from "react";

import { SIDEBAR_MIN_WIDTH } from "./createSidebarStore";
import { ExplorerTab } from "./Explorer/ExplorerTab";
import { SidebarResizeHandle } from "./SidebarResizeHandle";
import { useNavSidebarStore } from "./sidebarStores";

// Left navigation sidebar (Explorer): connection switcher + search + tree.
// Present on every route; pushes content. Dark-themed.
export function NavSidebar() {
  const isOpen = useNavSidebarStore((s) => s.isOpen);
  const width = useNavSidebarStore((s) => s.width);

  const motionWidth = useMotionValue(isOpen ? width : 0);
  useEffect(() => {
    const controls = animate(motionWidth, isOpen ? width : 0, { duration: 0.18 });
    return () => controls.stop();
  }, [isOpen, width, motionWidth]);

  return (
    <>
      <motion.aside
        id="nav-sidebar"
        aria-label="Navigation"
        data-theme="dark"
        style={{ width: motionWidth }}
        className="shrink-0 flex flex-col overflow-hidden border-r border-(--color-border-default) bg-(--color-surface-default) text-(--color-text-primary)"
        inert={!isOpen ? true : undefined}
      >
        <div className="flex h-full flex-col" style={{ minWidth: SIDEBAR_MIN_WIDTH }}>
          <ExplorerTab />
        </div>
      </motion.aside>

      <SidebarResizeHandle store={useNavSidebarStore} side="left" motionWidth={motionWidth} />
    </>
  );
}
