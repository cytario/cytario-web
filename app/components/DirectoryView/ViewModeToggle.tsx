import { Grid2x2, Grid3x3, List, Rows3, Square } from "lucide-react";

import { useLayoutStore, ViewMode } from "./useLayoutStore";

interface ViewModeButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}

/**
 * Custom toggle button for view mode selection.
 *
 * Uses a hand-built button instead of `@cytario/design` ToggleButton because
 * the design system component lacks support for bordered, square, high-contrast
 * toggle groups (see UI-ISSUES.md).
 */
function ViewModeButton({ active, onClick, icon, label }: ViewModeButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={`flex items-center justify-center w-8 h-8 border border-slate-300 ${
        active
          ? "bg-slate-700 text-white"
          : "bg-white text-slate-700 hover:bg-slate-300"
      }`}
    >
      {icon}
    </button>
  );
}

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
        <ViewModeButton
          key={mode}
          active={viewMode === mode}
          onClick={() => setViewMode(mode)}
          icon={icon}
          label={label}
        />
      ))}
    </div>
  );
}
