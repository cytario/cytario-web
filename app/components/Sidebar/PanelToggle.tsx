import { IconButton } from "@cytario/design";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

import { SIDEBAR, SIDEBAR_TOGGLE_ACTIVE_CLASS, sidebarDomId, sidebarToggleId } from "./Sidebar";
import { useNavSidebarStore } from "./sidebarStores";

export function PanelToggle() {
  const isOpen = useNavSidebarStore((s) => s.isOpen);
  const toggle = useNavSidebarStore((s) => s.toggle);

  return (
    <IconButton
      id={sidebarToggleId(SIDEBAR.nav)}
      icon={isOpen ? PanelLeftClose : PanelLeftOpen}
      aria-label="Toggle navigation panel"
      aria-expanded={isOpen}
      aria-controls={sidebarDomId(SIDEBAR.nav)}
      variant="ghost"
      className={isOpen ? SIDEBAR_TOGGLE_ACTIVE_CLASS : undefined}
      onPress={toggle}
    />
  );
}
