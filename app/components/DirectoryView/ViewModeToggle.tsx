import { Radio, RadioGroup } from "@headlessui/react";

import { Icon, LucideIconsType } from "../Controls";
import { useLayoutStore, ViewMode } from "./useLayoutStore";
import { Tooltip } from "../Tooltip/Tooltip";

const modes: { mode: ViewMode; icon: LucideIconsType; label: string }[] = [
  { mode: "list-wide", icon: "Rows3", label: "Wide List View" },
  { mode: "list", icon: "List", label: "List View" },
  { mode: "grid-sm", icon: "Grid3x3", label: "Small Grid" },
  { mode: "grid-md", icon: "Grid2x2", label: "Medium Grid" },
  { mode: "grid-lg", icon: "Square", label: "Large Grid" },
];

export function ViewModeToggle() {
  const { viewMode, setViewMode } = useLayoutStore();

  return (
    <RadioGroup
      value={viewMode}
      onChange={setViewMode}
      className="flex gap-1"
      aria-label="View mode"
    >
      {modes.map(({ mode, icon, label }) => (
        <Tooltip key={mode} content={label}>
          <Radio
            value={mode}
            aria-label={label}
            className="flex cursor-pointer items-center justify-center w-8 h-8 border border-slate-300 outline-none focus-visible:ring-2 focus-visible:ring-cytario-turquoise-700 data-[checked]:bg-slate-700 data-[checked]:text-white bg-white hover:bg-slate-300"
          >
            <Icon icon={icon} size={16} />
          </Radio>
        </Tooltip>
      ))}
    </RadioGroup>
  );
}
