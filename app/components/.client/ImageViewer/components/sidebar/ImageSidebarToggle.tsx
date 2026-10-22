import { IconButton } from "@cytario/design";
import { useEffect } from "react";

import { useViewerSidebarStore } from "../useViewerSidebarStore";
import { IMAGE_SIDEBAR_NAME } from "./ImageSidebar";
import { useLayoutStore } from "~/components/DirectoryView/useLayoutStore";
import { sidebarDomId, sidebarToggleId } from "~/components/Sidebar/Sidebar";

/**
 * Projects the viewer sidebar toggle into the application header's right
 * cluster (left of the user and help menus) while the viewer is mounted. The
 * header only renders the slot, so it never imports the viewer.
 */
export const ImageSidebarToggle = () => {
  const isOpen = useViewerSidebarStore((s) => s.isOpen);
  const toggle = useViewerSidebarStore((s) => s.toggle);
  const setHeaderSlot = useLayoutStore((s) => s.setHeaderSlot);

  useEffect(() => {
    setHeaderSlot(
      <IconButton
        id={sidebarToggleId(IMAGE_SIDEBAR_NAME)}
        icon={isOpen ? "PanelRightClose" : "PanelRightOpen"}
        label="Toggle image controls"
        aria-controls={sidebarDomId(IMAGE_SIDEBAR_NAME)}
        aria-expanded={isOpen}
        variant={isOpen ? "ghost" : "primary"}
        onPress={toggle}
      />,
    );
    return () => setHeaderSlot(null);
  }, [isOpen, toggle, setHeaderSlot]);

  return null;
};
