import type { ViewerSlice, ViewState } from "../types";

export interface ViewSlice {
  viewStatePreview: ViewState | null;
  viewStateActive: ViewState | null;
  cursorPosition: { x: number; y: number } | null;
  /** Live pixel values under the cursor, keyed by channel id. Hot path — never persist. */
  pixelValues: Record<string, number>;

  setViewStatePreview: (viewState: ViewState) => void;
  setViewStateActive: (viewState: ViewState) => void;
  setCursorPosition: (position: { x: number; y: number } | null) => void;
  setPixelValues: (ids: string[], values: number[]) => void;
}

/** View state (zoom/pan), cursor position, and live hover pixel values. */
export const createViewSlice: ViewerSlice<ViewSlice> = (set) => ({
  viewStatePreview: null,
  viewStateActive: null,
  cursorPosition: null,
  pixelValues: {},

  setViewStatePreview: (viewStatePreview) =>
    set(
      (state) => {
        state.viewStatePreview = viewStatePreview;
      },
      false,
      "setViewStatePreview",
    ),

  setViewStateActive: (viewStateActive) =>
    set(
      (state) => {
        state.viewStateActive = viewStateActive;
        state.viewStateActive.minZoom = -(state.loader?.length ?? 0);
        state.viewStateActive.maxZoom = 2;
      },
      false,
      "setViewStateActive",
    ),

  setCursorPosition: (cursorPosition) =>
    set((state) => ({ ...state, cursorPosition }), false, "setCursorPosition"),

  setPixelValues: (ids, values) =>
    set(
      (state) => {
        ids.forEach((id, index) => {
          state.pixelValues[id] = values[index];
        });
      },
      false,
      "setPixelValues",
    ),
});
