import { IconButton } from "@cytario/design";

import { FloatingBar } from "../Toolbar";
import { useViewerSidebarStore } from "../useViewerSidebarStore";
import { IMAGE_SIDEBAR_NAME } from "./ImageSidebar";
import { sidebarDomId, sidebarToggleId } from "~/components/Sidebar/Sidebar";

/** Always-visible toggle (bottom-right) so the panel can be reopened when collapsed. */
export const ImageSidebarToggle = () => {
  const isOpen = useViewerSidebarStore((s) => s.isOpen);
  const toggle = useViewerSidebarStore((s) => s.toggle);

  return (
    <FloatingBar className="bottom-8 right-8">
      <IconButton
        id={sidebarToggleId(IMAGE_SIDEBAR_NAME)}
        icon={isOpen ? "PanelRightClose" : "PanelRightOpen"}
        label="Toggle image controls"
        aria-controls={sidebarDomId(IMAGE_SIDEBAR_NAME)}
        aria-expanded={isOpen}
        variant={isOpen ? "ghost" : "primary"}
        onPress={toggle}
      />
    </FloatingBar>
  );
};
