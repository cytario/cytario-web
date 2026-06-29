import { Icon, type IconName, SegmentedControl, SegmentedControlItem } from "@cytario/design";

import { useLayoutStore, type ViewMode } from "./useLayoutStore";

const modes: {
  id: ViewMode;
  label: string;
  iconName: IconName;
}[] = [
  { id: "list", label: "List view", iconName: "List" },
  { id: "grid", label: "Grid view", iconName: "LayoutGrid" },
  { id: "tree", label: "Tree view", iconName: "FolderTree" },
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
      {modes.map(({ id, label, iconName }) => (
        <SegmentedControlItem key={id} id={id} aria-label={label}>
          <Icon icon={iconName} size="sm" />
        </SegmentedControlItem>
      ))}
    </SegmentedControl>
  );
}
