import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type DisplayUnit = "metric" | "pixels";

interface DisplayUnitState {
  /** Global unit for every unit-bearing viewer surface: rulers, scale bar, stamp input. */
  displayUnit: DisplayUnit;
  toggleDisplayUnit: () => void;
}

export const useDisplayUnitStore = create<DisplayUnitState>()(
  persist(
    (set) => ({
      displayUnit: "metric",
      toggleDisplayUnit: () =>
        set((state) => ({
          displayUnit: state.displayUnit === "metric" ? "pixels" : "metric",
        })),
    }),
    { name: "cytario-display-unit", storage: createJSONStorage(() => localStorage) },
  ),
);
