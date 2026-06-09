import { Tabs } from "@cytario/design";
import { animate, motion, useMotionValue } from "motion/react";
import { useEffect } from "react";
import { twMerge } from "tailwind-merge";

import { ExplorerTab } from "./Explorer/ExplorerTab";
import { SidebarResizeHandle } from "./SidebarResizeHandle";
import { TabStrip } from "./TabStrip";
import { SidebarViewerOutlet } from "./Viewer/SidebarViewerOutlet";
import {
  SIDEBAR_MIN_WIDTH,
  type SidebarTab,
  useLayoutStore,
} from "~/components/DirectoryView/useLayoutStore";

export function Sidebar() {
  const isOpen = useLayoutStore((s) => s.sidebarOpen);
  const width = useLayoutStore((s) => s.sidebarWidth);
  const tab = useLayoutStore((s) => s.sidebarTab);
  const setTab = useLayoutStore((s) => s.setSidebarTab);
  const viewerActive = useLayoutStore((s) => s.viewerTabActive);

  const motionWidth = useMotionValue(isOpen ? width : 0);

  useEffect(() => {
    const controls = animate(motionWidth, isOpen ? width : 0, { duration: 0.18 });
    return () => controls.stop();
  }, [isOpen, width, motionWidth]);

  const showViewerTab = viewerActive;
  const selectedTab: SidebarTab = showViewerTab ? tab : "explorer";

  return (
    <motion.aside
      id="sidebar-panel"
      aria-label="Navigation"
      style={{ width: motionWidth }}
      className="relative shrink-0 flex flex-col overflow-hidden border-r border-(--color-border-default) bg-(--color-surface-default)"
      inert={!isOpen ? true : undefined}
    >
      <div className="flex h-full flex-col" style={{ minWidth: SIDEBAR_MIN_WIDTH }}>
        <Tabs
          className="shrink-0"
          selectedKey={selectedTab}
          onSelectionChange={(key) => setTab(key as SidebarTab)}
        >
          <TabStrip showViewerTab={showViewerTab} />
        </Tabs>

        {/* Panels overlap in one grid cell and toggle with visibility — both
            stay mounted AND laid out, so switching is paint-only: no remount,
            no relayout of the portaled histograms, no react-aria inert walk. */}
        <div className="grid min-h-0 flex-1">
          <div
            role="tabpanel"
            className={twMerge(
              "[grid-area:1/1] min-h-0 overflow-y-auto",
              selectedTab !== "explorer" && "invisible pointer-events-none",
            )}
          >
            <ExplorerTab />
          </div>
          {showViewerTab && (
            <div
              role="tabpanel"
              className={twMerge(
                "[grid-area:1/1] min-h-0 overflow-y-auto",
                selectedTab !== "viewer" && "invisible pointer-events-none",
              )}
            >
              <SidebarViewerOutlet />
            </div>
          )}
        </div>
      </div>

      <SidebarResizeHandle motionWidth={motionWidth} />
    </motion.aside>
  );
}
