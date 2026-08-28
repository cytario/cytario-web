import { IconButton } from "@cytario/design";

import { sidebarDomId, sidebarToggleId } from "../Sidebar";
import { useNavSidebarStore } from "../sidebarStores";
import { EXPLORER_SIDEBAR_NAME } from "./ExplorerSidebar";

export function ExplorerSidebarToggle() {
  const isOpen = useNavSidebarStore((s) => s.isOpen);
  const toggle = useNavSidebarStore((s) => s.toggle);

  return (
    <IconButton
      id={sidebarToggleId(EXPLORER_SIDEBAR_NAME)}
      icon={isOpen ? "PanelLeftClose" : "PanelLeftOpen"}
      label="Toggle navigation panel"
      aria-controls={sidebarDomId(EXPLORER_SIDEBAR_NAME)}
      aria-expanded={isOpen}
      variant={isOpen ? "ghost" : "primary"}
      onPress={toggle}
      size="sm"
    />
  );
}
