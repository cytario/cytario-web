import type { Layer, PickingInfo } from "@deck.gl/core";
import type { Geometry } from "geojson";

import type { ViewerSlice, ViewState } from "../types";

/**
 * One unit of tooltip content contributed by a layer hook's
 * `getTooltipItems` callback. All current layer hooks (channels, overlays, annotations) and any future plugin return
 * `TooltipItem[]`; `useCompositeHover` merges them into a
 * {@link CompositeTooltip}.
 *
 * Keep this contract pure and synchronous — no async in the hover path.
 * Plugins pre-fetch and cache; the tooltip reads the cache.
 */
export interface TooltipItem {
  /** Stable provider id — `"channels" | "overlays" | "annotations"`. */
  providerId: string;
  /** Kind tag — drives section ordering and the left-edge accent stripe. */
  kind: "channel" | "annotation" | "overlay";
  /** Header label — channel name, annotation name, "Cell 1234", … */
  label: string;
  /** Key/value rows below the header. `color` paints a swatch for the row. */
  values: { key: string; value: string; color?: number[] }[];
  /** Optional GeoJSON geometry — rendered as a thumbnail preview by the
   *  tooltip for annotation and overlay items. Channels omit this. */
  geometry?: Geometry | null;
}

/** Composite hover tooltip — the merged output of the hover pipeline. */
export interface CompositeTooltip {
  cursor: { x: number; y: number };
  /** Level-0 pixel-space coordinate under the cursor. */
  coordinate: number[];
  items: TooltipItem[];
  mode: "compact" | "verbose";
}

/** Unified return type for all layer hooks (channels, overlays, annotations,
 *  and future plugins). Each hook returns its layers plus a `getTooltipItems`
 *  callback that maps a deck.gl pick to zero or more {@link TooltipItem}s.
 *  Transparent / hidden picks return `[]` — the composite hook uses
 *  `items.length > 0` to detect non-transparent annotation hits. */
export interface CytarioLayerResult<T extends Layer = Layer> {
  layers: T[];
  getTooltipItems: (info: PickingInfo) => TooltipItem[];
}

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

  setCompositeTooltip: (compositeTooltip) =>
    set(
      (state) => {
        state.compositeTooltip = compositeTooltip;
      },
      false,
      "setCompositeTooltip",
    ),

  setHoverMode: (hoverMode) =>
    set(
      (state) => {
        state.hoverMode = hoverMode;
      },
      false,
      "setHoverMode",
    ),

  pinTooltip: () =>
    set(
      (state) => {
        const current = state.compositeTooltip;
        if (current) state.pinnedTooltip = current;
      },
      false,
      "pinTooltip",
    ),

  unpinTooltip: () =>
    set(
      (state) => {
        state.pinnedTooltip = null;
      },
      false,
      "unpinTooltip",
    ),
});
