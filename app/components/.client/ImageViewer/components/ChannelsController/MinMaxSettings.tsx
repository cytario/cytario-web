import { IconButton } from "@cytario/design";
import { RotateCcw } from "lucide-react";
import { useState } from "react";

import { select } from "../../state/selectors";
import { ByteDomain } from "../../state/types";
import { useViewerStore } from "../../state/ViewerStoreContext";
import { Input } from "~/components/Controls";

export function MinMaxSettings() {
  const selectedChannel = useViewerStore(select.selectedChannel);
  const setContrastLimits = useViewerStore(select.setContrastLimits);
  const resetContrastLimits = useViewerStore(
    (state) => state.resetContrastLimits,
  );

  // Local state only used while editing (null = not editing, use store value)
  const [editingMin, setEditingMin] = useState<string | null>(null);
  const [editingMax, setEditingMax] = useState<string | null>(null);

  const minValue =
    editingMin ?? String(selectedChannel?.contrastLimits[0] ?? 0);
  const maxValue =
    editingMax ?? String(selectedChannel?.contrastLimits[1] ?? 0);

  const commitValue = (type: "min" | "max", value: string) => {
    // Clear editing state first
    if (type === "min") {
      setEditingMin(null);
    } else {
      setEditingMax(null);
    }

    if (!selectedChannel) return;

    const numValue = parseInt(value, 10);
    if (isNaN(numValue)) return;

    const [domainMin, domainMax] = selectedChannel.domain;
    const clampedValue = Math.max(domainMin, Math.min(domainMax, numValue));

    const currentLimits = selectedChannel.contrastLimits;
    let newLimits: ByteDomain;

    if (type === "min") {
      // Ensure min doesn't exceed max
      const newMin = Math.min(clampedValue, currentLimits[1]);
      newLimits = [newMin, currentLimits[1]];
    } else {
      // Ensure max doesn't go below min
      const newMax = Math.max(clampedValue, currentLimits[0]);
      newLimits = [currentLimits[0], newMax];
    }

    setContrastLimits(newLimits);
  };

  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    type: "min" | "max",
  ) => {
    if (e.key === "Enter") {
      e.currentTarget.blur();
    } else if (e.key === "Escape") {
      // Clear editing state without committing
      if (type === "min") {
        setEditingMin(null);
      } else {
        setEditingMax(null);
      }
      e.currentTarget.blur();
    }
  };

  const isResetDisabled =
    !selectedChannel ||
    (selectedChannel.contrastLimits[0] ===
      selectedChannel.contrastLimitsInitial[0] &&
      selectedChannel.contrastLimits[1] ===
        selectedChannel.contrastLimitsInitial[1]);

  return (
    <div className="m-2 flex gap-2 items-center">
      <div className="relative flex min-w-0">
        <label htmlFor="min-contrast" className="absolute left-2 text-sm font-bold top-1/2 -translate-y-1/2 leading-[1.2]">
          Min
        </label>
        <Input
          id="min-contrast"
          theme="dark"
          className="text-right [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]"
          type="number"
          value={minValue}
          disabled={!selectedChannel}
          onChange={(e) => setEditingMin(e.target.value)}
          onBlur={(e) => commitValue("min", e.target.value)}
          onKeyDown={(e) => handleKeyDown(e, "min")}
        />
      </div>
      <div className="relative flex min-w-0">
        <label htmlFor="max-contrast" className="absolute left-2 text-sm font-bold top-1/2 -translate-y-1/2 leading-[1.2]">
          Max
        </label>
        <Input
          id="max-contrast"
          theme="dark"
          className="text-right [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]"
          type="number"
          value={maxValue}
          disabled={!selectedChannel}
          onChange={(e) => setEditingMax(e.target.value)}
          onBlur={(e) => commitValue("max", e.target.value)}
          onKeyDown={(e) => handleKeyDown(e, "max")}
        />
      </div>
      <IconButton
        aria-label="Reset contrast"
        isDisabled={isResetDisabled}
        icon={RotateCcw}
        onPress={resetContrastLimits}
      />
    </div>
  );
}
