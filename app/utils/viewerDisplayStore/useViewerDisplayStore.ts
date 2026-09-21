import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type DisplayUnit = "metric" | "pixels";

interface ViewerDisplayState {
  /** Global unit for every unit-bearing viewer surface: rulers, scale bar, stamp input. */
  displayUnit: DisplayUnit;
  /** Whether the scale bar overlay (SRS-CY-33104) is shown. */
  scaleBarVisible: boolean;
  /** Whether the calibrated rulers (SRS-CY-33116) are shown. */
  rulersVisible: boolean;
  toggleDisplayUnit: () => void;
  toggleScaleBar: () => void;
  toggleRulers: () => void;
}

// Key predates the rename — keep it so a persisted unit preference survives upgrades.
const STORAGE_KEY = "cytario-display-unit";

export const useViewerDisplayStore = create<ViewerDisplayState>()(
  persist(
    (set) => ({
      displayUnit: "metric",
      scaleBarVisible: true,
      rulersVisible: true,
      toggleDisplayUnit: () =>
        set((state) => ({
          displayUnit: state.displayUnit === "metric" ? "pixels" : "metric",
        })),
      toggleScaleBar: () => set((state) => ({ scaleBarVisible: !state.scaleBarVisible })),
      toggleRulers: () => set((state) => ({ rulersVisible: !state.rulersVisible })),
    }),
    { name: STORAGE_KEY, storage: createJSONStorage(() => localStorage) },
  ),
);
