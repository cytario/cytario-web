import type { ViewerSlice, ViewState, CompositeTooltip } from "../types";

export interface ViewSlice {
  viewStatePreview: ViewState | null;
  viewStateActive: ViewState | null;
  cursorPosition: { x: number; y: number } | null;
  /** Live pixel values under the cursor, keyed by channel id. Hot path — never persist. */
  pixelValues: Record<string, number>;

  /** Composite hover tooltip — transient, lives only while the cursor is
   *  over the deck. Never persisted (hot path). */
  compositeTooltip: CompositeTooltip | null;
  /** Verbosity of the composite tooltip — toggled by the Shift modifier. */
  hoverMode: "compact" | "verbose";
  /** Pinned tooltip snapshot — survives cursor move/leave. Set by `pinTooltip`. */
  pinnedTooltip: CompositeTooltip | null;

  setViewStatePreview: (viewState: ViewState) => void;
  setViewStateActive: (viewState: ViewState) => void;
  setCursorPosition: (position: { x: number; y: number } | null) => void;
  setPixelValues: (ids: string[], values: number[]) => void;

  setCompositeTooltip: (t: CompositeTooltip | null) => void;
  setHoverMode: (mode: "compact" | "verbose") => void;
  /** Copy the current `compositeTooltip` into `pinnedTooltip`. No-op if null. */
  pinTooltip: () => void;
  unpinTooltip: () => void;
}

/** View state (zoom/pan), cursor position, and live hover pixel values. */
export const createViewSlice: ViewerSlice<ViewSlice> = (set) => ({
  viewStatePreview: null,
  viewStateActive: null,
  cursorPosition: null,
  pixelValues: {},

  compositeTooltip: null,
  hoverMode: "compact",
  pinnedTooltip: null,

  setViewStatePreview: (viewStatePreview) =>
    set(
      (viewerStore) => {
        viewerStore.viewStatePreview = viewStatePreview;
      },
      false,
      "setViewStatePreview",
    ),

  setViewStateActive: (viewStateActive) =>
    set(
      (viewerStore) => {
        viewerStore.viewStateActive = viewStateActive;
        viewerStore.viewStateActive.minZoom = -(viewerStore.loader?.length ?? 0);
        viewerStore.viewStateActive.maxZoom = 2;
      },
      false,
      "setViewStateActive",
    ),

  setCursorPosition: (cursorPosition) =>
    set((viewerStore) => ({ ...viewerStore, cursorPosition }), false, "setCursorPosition"),

  setPixelValues: (ids, values) =>
    set(
      (viewerStore) => {
        ids.forEach((id, index) => {
          viewerStore.pixelValues[id] = values[index];
        });
      },
      false,
      "setPixelValues",
    ),

  setCompositeTooltip: (compositeTooltip) =>
    set(
      (viewerStore) => {
        viewerStore.compositeTooltip = compositeTooltip;
      },
      false,
      "setCompositeTooltip",
    ),

  setHoverMode: (hoverMode) =>
    set(
      (viewerStore) => {
        viewerStore.hoverMode = hoverMode;
      },
      false,
      "setHoverMode",
    ),

  pinTooltip: () =>
    set(
      (viewerStore) => {
        const current = viewerStore.compositeTooltip;
        if (current) viewerStore.pinnedTooltip = current;
      },
      false,
      "pinTooltip",
    ),

  unpinTooltip: () =>
    set(
      (viewerStore) => {
        viewerStore.pinnedTooltip = null;
      },
      false,
      "unpinTooltip",
    ),
});
