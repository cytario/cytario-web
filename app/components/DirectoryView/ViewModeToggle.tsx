import { SegmentedControl, SegmentedControlItem } from "@cytario/design";
import { FolderTree, LayoutGrid, List } from "lucide-react";

import { useLayoutStore, type ViewMode } from "./useLayoutStore";

const modes: {
  id: ViewMode;
  label: string;
  Icon: typeof List;
}[] = [
  { id: "list", label: "List view", Icon: List },
  { id: "grid", label: "Grid view", Icon: LayoutGrid },
  { id: "tree", label: "Tree view", Icon: FolderTree },
];

export function ViewModeToggle() {
  const { viewMode, setViewMode } = useLayoutStore();

  return (
    <SegmentedControl
      selectedKeys={new Set([viewMode])}
      onSelectionChange={(keys) => {
        const key = [...keys][0];
        if (key) setViewMode(key as ViewMode);
      }}
      selectionMode="single"
      size="sm"
      aria-label="View mode"
    >
      {modes.map(({ id, label, Icon }) => (
        <SegmentedControlItem key={id} id={id} aria-label={label}>
          <Icon size={16} />
        </SegmentedControlItem>
      ))}
    </SegmentedControl>
  );
}
