import type { Layer, PickingInfo } from "@deck.gl/core";
import type { Geometry } from "geojson";

import type { ViewerSlice, ViewState } from "../types";

/**
 * One unit of tooltip content contributed by a layer hook's
 * `getTooltipItems` callback. The `values` Record is keyed by the label
 * shown to the user (channel name, class name, marker name); the entry's
 * `value` is optional supplementary data (e.g. channel intensity). `color`
 * paints a swatch and/or the geometry thumbnail.
 *
 * For features with geometry (annotations, overlays), `geometry` is set
 * so the tooltip can render a preview thumbnail. Channels omit it.
 *
 * Keep this contract pure and synchronous — no async in the hover path.
 */
export type TooltipSection = "Channels" | "Overlays" | "Annotations";

export interface LayerTooltipItem {
  /** Discriminator for section grouping in the renderer
   *  (channels → overlays → annotations). */
  type: TooltipSection;
  /** Display name shown in the sidebar (annotation `annotationNameOf`,
   *  overlay Arrow `id` column). Channels omit it. */
  id?: string;
  values: Record<string, { value: string; color?: number[] }>;
  geometry?: Geometry | null;
  /** Colour for the geometry thumbnail. For overlays this is the
   *  additively-blended marker colour (matching the layer render); for
   *  annotations it's the class colour. Channels have no geometry. */
  geometryColor?: number[];
}

export interface CompositeTooltip {
  cursor: { x: number; y: number };
  coordinate: number[];
  /** Grouped by section in display order (Channels → Overlays → Annotations).
   *  Empty sections are omitted. */
  sections: Partial<Record<TooltipSection, LayerTooltipItem[]>>;
  mode: "compact" | "verbose";
}

/** Unified return type for all layer hooks (channels, overlays, annotations).
 *  Each hook returns its layers plus a `getTooltipItems` callback that maps
 *  a deck.gl pick to zero or more {@link LayerTooltipItem}s. Transparent /
 *  hidden picks return `[]`. */
export interface CytarioLayerResult<T extends Layer = Layer> {
  layers: T[];
  getTooltipItems: (info: PickingInfo) => LayerTooltipItem[];
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
