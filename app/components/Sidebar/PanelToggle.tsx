import { IconButton } from "@cytario/design";
import { PanelLeft } from "lucide-react";

import { useNavSidebarStore } from "./sidebarStores";

export function PanelToggle() {
  const isOpen = useNavSidebarStore((s) => s.isOpen);
  const toggle = useNavSidebarStore((s) => s.toggle);

  return (
    <IconButton
      icon={PanelLeft}
      aria-label="Toggle navigation panel"
      aria-expanded={isOpen}
      aria-controls="nav-sidebar"
      variant={isOpen ? "primary" : "ghost"}
      onPress={toggle}
    />
  );
}
