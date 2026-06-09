import { TabPanel, Tabs } from "@cytario/design";
import { motion } from "motion/react";

import { ExplorerTab } from "./Explorer/ExplorerTab";
import { SidebarResizeHandle } from "./SidebarResizeHandle";
import { TabStrip } from "./TabStrip";
import { type SidebarTab, useSidebarStore } from "./useSidebarStore";

export function Sidebar() {
  const isOpen = useSidebarStore((s) => s.isOpen);
  const width = useSidebarStore((s) => s.width);
  const activeTab = useSidebarStore((s) => s.activeTab);
  const setActiveTab = useSidebarStore((s) => s.setActiveTab);

  // Viewer tab hosting lands with the FeatureBar lift.
  const showViewerTab = false;
  const effectiveTab: SidebarTab = showViewerTab ? activeTab : "explorer";

  return (
    <motion.aside
      id="sidebar-panel"
      aria-label="Navigation"
      data-state={isOpen ? "open" : "closed"}
      className="absolute inset-y-0 left-0 z-30 flex flex-col border-r border-(--color-border-default) bg-(--color-surface-default) shadow-lg"
      style={{ width }}
      initial={false}
      animate={{ x: isOpen ? 0 : "-100%" }}
      transition={{ type: "tween", duration: 0.18 }}
      inert={!isOpen ? true : undefined}
    >
      <Tabs
        className="flex min-h-0 flex-1 flex-col"
        selectedKey={effectiveTab}
        onSelectionChange={(key) => setActiveTab(key as SidebarTab)}
      >
        <TabStrip showViewerTab={showViewerTab} />
        <TabPanel id="explorer" className="min-h-0 flex-1">
          <ExplorerTab />
        </TabPanel>
      </Tabs>

      <SidebarResizeHandle />
    </motion.aside>
  );
}
