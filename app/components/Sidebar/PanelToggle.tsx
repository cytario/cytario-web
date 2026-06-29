import { IconButtonToggle } from "@cytario/design";

import { SIDEBAR, sidebarDomId, sidebarToggleId } from "./Sidebar";
import { useNavSidebarStore } from "./sidebarStores";

export function PanelToggle() {
  const isOpen = useNavSidebarStore((s) => s.isOpen);
  const toggle = useNavSidebarStore((s) => s.toggle);

  return (
    <IconButtonToggle
      id={sidebarToggleId(SIDEBAR.nav)}
      icon={isOpen ? "PanelLeftClose" : "PanelLeftOpen"}
      label="Toggle navigation panel"
      aria-controls={sidebarDomId(SIDEBAR.nav)}
      aria-expanded={isOpen}
      variant="ghost"
      isSelected={isOpen}
      onChange={toggle}
      size="sm"
    />
  );
}
