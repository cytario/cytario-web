import { IconButton } from "@cytario/design";
import { PanelLeft } from "lucide-react";

import { useSidebarStore } from "./useSidebarStore";

export function PanelToggle() {
  const isOpen = useSidebarStore((s) => s.isOpen);
  const toggleOpen = useSidebarStore((s) => s.toggleOpen);

  return (
    <IconButton
      icon={PanelLeft}
      aria-label="Toggle navigation panel"
      aria-expanded={isOpen}
      aria-controls="sidebar-panel"
      variant={isOpen ? "primary" : "ghost"}
      onPress={toggleOpen}
    />
  );
}
