import { IconButton } from "@cytario/design";
import { PanelLeft } from "lucide-react";

import { useLayoutStore } from "~/components/DirectoryView/useLayoutStore";

export function PanelToggle() {
  const isOpen = useLayoutStore((s) => s.sidebarOpen);
  const toggle = useLayoutStore((s) => s.toggleSidebar);

  return (
    <IconButton
      icon={PanelLeft}
      aria-label="Toggle navigation panel"
      aria-expanded={isOpen}
      aria-controls="sidebar-panel"
      variant={isOpen ? "primary" : "ghost"}
      onPress={toggle}
    />
  );
}
