import { ToggleButton } from "@cytario/design";
import { Grid2x2, Grid3x3, List, Rows3, Square } from "lucide-react";

import { useLayoutStore, ViewMode } from "./useLayoutStore";

const modes: {
  mode: ViewMode;
  icon: React.ReactNode;
  label: string;
}[] = [
  { mode: "list-wide", icon: <Rows3 size={16} />, label: "Wide List View" },
  { mode: "list", icon: <List size={16} />, label: "List View" },
  { mode: "grid-sm", icon: <Grid3x3 size={16} />, label: "Small Grid" },
  { mode: "grid-md", icon: <Grid2x2 size={16} />, label: "Medium Grid" },
  { mode: "grid-lg", icon: <Square size={16} />, label: "Large Grid" },
];

export function ViewModeToggle() {
  const { viewMode, setViewMode } = useLayoutStore();

  return (
    <div className="flex gap-1" role="radiogroup" aria-label="View mode">
      {modes.map(({ mode, icon, label }) => (
        <ToggleButton
          key={mode}
          isSelected={viewMode === mode}
          onChange={() => setViewMode(mode)}
          size="sm"
          aria-label={label}
        >
          {icon}
        </ToggleButton>
      ))}
    </div>
  );
}
