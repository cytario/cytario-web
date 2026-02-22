import { ToggleButton } from "@cytario/design";
import { Grid2x2, Grid3x3, List, Square } from "lucide-react";

import { useDirectoryStore, ViewMode } from "./useDirectoryStore";

const modes: {
  mode: ViewMode;
  icon: React.ReactNode;
  label: string;
}[] = [
  { mode: "list", icon: <List size={16} />, label: "List View" },
  { mode: "grid-sm", icon: <Grid3x3 size={16} />, label: "Small Grid" },
  { mode: "grid-md", icon: <Grid2x2 size={16} />, label: "Medium Grid" },
  { mode: "grid-lg", icon: <Square size={16} />, label: "Large Grid" },
];

export function ViewModeToggle() {
  const { viewMode, setViewMode } = useDirectoryStore();

  return (
    <div className="flex gap-1">
      {modes.map(({ mode, icon, label }) => (
        <ToggleButton
          key={mode}
          aria-label={label}
          variant="outlined"
          isSquare
          size="sm"
          isSelected={viewMode === mode}
          onChange={() => setViewMode(mode)}
        >
          {icon}
        </ToggleButton>
      ))}
    </div>
  );
}
