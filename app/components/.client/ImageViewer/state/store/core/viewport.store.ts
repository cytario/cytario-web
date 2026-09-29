import type { ViewerSlice, ViewState, CompositeTooltip, CanvasPopup } from "../types";

export interface ViewSlice {
  viewStatePreview: ViewState | null;
  viewStateActive: ViewState | null;
  cursorPosition: { x: number; y: number } | null;
  /** Live pixel values under the cursor, keyed by channel id. Hot path — never persist. */
  pixelValues: Record<string, number>;

  /** Composite hover tooltip — transient, lives only while the cursor is
   *  over the deck. Never persisted (hot path). */
  compositeTooltip: CompositeTooltip | null;
  /** Click popup at a canvas point — snapshot content, dismissed on outside
   *  click / Escape / pan-zoom. Never persisted. */
  popup: CanvasPopup | null;

  setViewStatePreview: (viewState: ViewState) => void;
  setViewStateActive: (viewState: ViewState) => void;
  setCursorPosition: (position: { x: number; y: number } | null) => void;
  setPixelValues: (ids: string[], values: number[]) => void;
  clearPixelValues: () => void;

  setCompositeTooltip: (t: CompositeTooltip | null) => void;
  openPopup: (popup: CanvasPopup) => void;
  closePopup: () => void;
}

/** View state (zoom/pan), cursor position, and live hover pixel values. */
export const createViewSlice: ViewerSlice<ViewSlice> = (set) => ({
  viewStatePreview: null,
  viewStateActive: null,
  cursorPosition: null,
  pixelValues: {},

  compositeTooltip: null,
  popup: null,

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

  clearPixelValues: () =>
    set(
      (viewerStore) => {
        viewerStore.pixelValues = {};
      },
      false,
      "clearPixelValues",
    ),

  setCompositeTooltip: (compositeTooltip) =>
    set(
      (viewerStore) => {
        viewerStore.compositeTooltip = compositeTooltip;
      },
      false,
      "setCompositeTooltip",
    ),

  openPopup: (popup) =>
    set(
      (viewerStore) => {
        viewerStore.popup = popup;
      },
      false,
      "openPopup",
    ),

  closePopup: () =>
    set(
      (viewerStore) => {
        viewerStore.popup = null;
      },
      false,
      "closePopup",
    ),
});
