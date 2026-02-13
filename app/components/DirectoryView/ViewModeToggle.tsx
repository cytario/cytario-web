import { Icon } from "../Controls";
import { useDirectoryStore, ViewMode } from "./useDirectoryStore";

interface ToggleButtonProps {
  active: boolean;
  onClick: () => void;
  icon: "List" | "Grid2x2";
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

export function ViewModeToggle() {
  const { viewMode, setViewMode } = useDirectoryStore();

  const toggle = (mode: ViewMode) => () => setViewMode(mode);

  return (
    <div className="flex gap-1">
      <ToggleButton
        active={viewMode === "list"}
        onClick={toggle("list")}
        icon="List"
        label="List View"
      />
      <ToggleButton
        active={viewMode === "grid"}
        onClick={toggle("grid")}
        icon="Grid2x2"
        label="Grid View"
      />
    </div>
  );
}
