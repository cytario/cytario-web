import { IconButton } from "@cytario/design";

import { FloatingBar } from "./FloatingBar";
import { useViewerSidebarStore } from "./ImageViewer";
import { SIDEBAR, sidebarDomId, sidebarToggleId } from "~/components/Sidebar/Sidebar";

/** Always-visible toggle (bottom-right) so the panel can be reopened when collapsed. */
export const SidebarToggle = () => {
  const isOpen = useViewerSidebarStore((s) => s.isOpen);
  const toggle = useViewerSidebarStore((s) => s.toggle);

  return (
    <FloatingBar className="bottom-8 right-8">
      <IconButton
        id={sidebarToggleId(SIDEBAR.viewer)}
        icon={isOpen ? "PanelRightClose" : "PanelRightOpen"}
        label="Toggle image controls"
        aria-controls={sidebarDomId(SIDEBAR.viewer)}
        aria-expanded={isOpen}
        variant={isOpen ? "ghost" : "primary"}
        onPress={toggle}
      />
    </FloatingBar>
  );
};
