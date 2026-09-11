import { CoordinateSystemSection } from "./CoordinateSystemSection";
import { ElementsSection } from "./ElementsSection";
import { createSidebarStore } from "~/components/Sidebar/createSidebarStore";
import { Sidebar } from "~/components/Sidebar/Sidebar";

export const SPATIAL_DATA_SIDEBAR_NAME = "SpatialData Controls";

export const useSpatialDataSidebarStore = createSidebarStore({
  name: "SpatialDataSidebar",
});

/** Viewer controls sidebar: element visibility/opacity, coordinate system. */
export const SpatialDataSidebar = () => (
  <Sidebar
    name={SPATIAL_DATA_SIDEBAR_NAME}
    side="right"
    store={useSpatialDataSidebarStore}
    toggleShortcut="mod+shift+b"
    openOnMount
  >
    <ElementsSection />
    <CoordinateSystemSection />
  </Sidebar>
);
