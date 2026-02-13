import { Icon, LucideIconsType } from "../Controls";
import { useDirectoryStore, ViewMode } from "./useDirectoryStore";

interface ToggleButtonProps {
  active: boolean;
  onClick: () => void;
  icon: LucideIconsType;
  label: string;
}

function ToggleButton({ active, onClick, icon, label }: ToggleButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={`
        flex items-center justify-center
        w-8 h-8
        border border-slate-300
        ${active ? "bg-slate-700 text-white" : "bg-white hover:bg-slate-300"}
      `}
    >
      <Icon icon={icon} size={16} />
    </button>
  );
}

const modes: { mode: ViewMode; icon: LucideIconsType; label: string }[] = [
  { mode: "list", icon: "List", label: "List View" },
  { mode: "grid-sm", icon: "Grid3x3", label: "Small Grid" },
  { mode: "grid-md", icon: "Grid2x2", label: "Medium Grid" },
  { mode: "grid-lg", icon: "Square", label: "Large Grid" },
];

export function ViewModeToggle() {
  const { viewMode, setViewMode } = useDirectoryStore();

  return (
    <div className="flex gap-1">
      {modes.map(({ mode, icon, label }) => (
        <ToggleButton
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
