import type { ToastData } from "@cytario/design";

import type { ViewerSlice, ViewerStore } from "../types";

const FORK_ACTIONS = new Set([
  "setContrastLimits",
  "resetContrastLimits",
  "setBrightfieldVisibility",
  "setBrightfieldVisibility/stats/success",
  "setBrightfieldVisibility/stats/error",
  "setChannelVisibility",
  "setChannelVisibility/stats/success",
  "setChannelVisibility/stats/error",
  "setChannelColor",
  "setChannelsOpacity",
  "addOverlaysState",
  "updateOverlaysState",
  "removeOverlaysState",
  "setOverlaysFillOpacity",
  "setShowCellOutline",
  "setMarkerVisibility",
  "setMarkerColor",
  "setAnnotationsOpacity",
  "setShowAnnotationOutline",
]);

/** `showToast` is injected by the React layer (useToast) — stores live outside the tree. */
export function withAutoFork(
  config: ViewerSlice<ViewerStore>,
  showToast?: (toast: Omit<ToastData, "id">) => void,
): typeof config {
  return (set, get, api) => {
    const forkedSet = ((...args: Parameters<typeof set>) => {
      const actionName = args[2] as string | undefined;
      if (actionName && FORK_ACTIONS.has(actionName)) {
        const state = get();
        const activeImagePanelIndex = state.imagePanels[state.imagePanelIndex];
        const layerState = state.layersStates[activeImagePanelIndex];
        if (layerState?.shared && layerState.author !== state.currentUserId) {
          get().forkView(activeImagePanelIndex);
          showToast?.({ variant: "info", message: "Forked shared view to your views" });
        }
      }
      return set(...args);
    }) as typeof set;
    return config(forkedSet, get, api);
  };
}
