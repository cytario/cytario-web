import type { Layer, OrthographicViewState, PickingInfo } from "@deck.gl/core";
import type { Geometry } from "geojson";
import type { StateCreator } from "zustand";

import type { AnnotationsSlice } from "./annotations/annotations.store";
import type { ChannelsSlice } from "./channels/channels.store";
import type { CoreSlice } from "./core/core.store";
import type { ViewSlice } from "./core/viewport.store";
import type { OverlaysSlice } from "./overlays/overlays.store";
import type { ViewsSlice } from "./views/views.store";
import type { OverlayConfig } from "~/utils/db/overlayConfig";

export type { OverlayConfig };

export type RGBA = [number, number, number, number];
export type RGB = [number, number, number];
export type ByteDomain = [number, number];

export interface ViewState extends OrthographicViewState {
  zoom: number;
  width: number;
  height: number;
  rotationX: number;
  rotationOrbit: number;
  target: [number, number];
  minRotationX: number;
  maxRotationX: number;
  minZoom: number;
  maxZoom: number;
  transitionDuration: number;
}

export type Selection = Record<"x" | "y" | "z" | "c" | "t", number>;

export interface ChannelsStateColumns {
  ids: string[];
  channelsVisible: boolean[];
  contrastLimits: ByteDomain[];
  colors: RGB[];
  selections: Selection[];
}

/** File-derived channel data — immutable across presets, stored in top-level `channels` only. */
export interface ImageChannelData {
  selection: Readonly<Selection>;
  domain: Readonly<ByteDomain>;
  histogram: number[];
  isInitialized: boolean;
  isLoading: boolean;
}

/** Per-preset user settings — stored in `layersStates[].channels`. */
export interface PresetChannelConfig {
  isVisible: boolean;
  contrastLimits: ByteDomain;
  color: RGB;
}

/** Full channel config — top-level `channels` entries (image data + preset settings merged). */
export type ChannelConfig = PresetChannelConfig & ImageChannelData;

export type ChannelsState = Record<string, ChannelConfig>;
export type LayerChannelsState = Record<string, Partial<PresetChannelConfig>>;

export interface LayersStateEntry {
  id: string;
  author: string;
  channels: LayerChannelsState;
  overlays: OverlaysState;
  channelsOpacity: number;
  overlaysFillOpacity: number;
  showCellOutline: boolean;
  annotationsOpacity: number;
  showAnnotationOutline: boolean;
  isChannelsLoading: number;
  isOverlaysLoading: number;
  name?: string;
  shared?: boolean;
}

export const createDefaultLayersStateEntry = (author = ""): LayersStateEntry => ({
  id: crypto.randomUUID(),
  author,
  channels: {},
  overlays: {},
  channelsOpacity: 1,
  overlaysFillOpacity: 0.8,
  showCellOutline: true,
  annotationsOpacity: 1,
  showAnnotationOutline: true,
  isChannelsLoading: 0,
  isOverlaysLoading: 0,
});

export const BRIGHTFIELD_GROUP_ID = "__brightfield__" as const;

export interface BrightfieldGroup {
  red: string;
  green: string;
  blue: string;
}

/** Detects brightfield R/G/B channels by name from UltiStacker output. */
export const detectBrightfieldGroup = (channelIds: readonly string[]): BrightfieldGroup | null => {
  const red = channelIds.find((id) => id.toLowerCase() === "red");
  const green = channelIds.find((id) => id.toLowerCase() === "green");
  const blue = channelIds.find((id) => id.toLowerCase() === "blue");

  if (red && green && blue) return { red, green, blue };
  return null;
};
export interface ViewPort {
  width: number;
  height: number;
}

export interface CellMarker {
  color: RGBA;
  count: number;
  isVisible: boolean;
  /** Display label; falls back to the marker key when absent (legacy state). */
  label?: string;
}

export type OverlayState = Record<string, CellMarker>; // Dataset ~ File

/** One loaded overlay file: its markers plus the column mapping they derive from. */
export interface OverlayEntry {
  markers: OverlayState;
  config: OverlayConfig | null;
}

export type OverlaysState = Record<string, OverlayEntry>; // Datasets

export type AnnotationMode = "view" | "inspect" | "draw-polygon" | "draw-freehand" | "draw-point";

export type TooltipSection = "Channels" | "Overlays" | "Annotations";

export interface LayerTooltipItem {
  type: TooltipSection;
  id?: string;
  values: Record<string, { value: string; color?: number[] }>;
  geometry?: Geometry | null;
  geometryColor?: number[];
}

export interface CompositeTooltip {
  cursor: { x: number; y: number };
  coordinate: number[];
  sections: Partial<Record<TooltipSection, LayerTooltipItem[]>>;
  mode: "compact" | "verbose";
}

export interface CytarioLayerResult<T extends Layer = Layer> {
  layers: T[];
  getTooltipItems: (info: PickingInfo) => LayerTooltipItem[];
}

export interface ViewerStoreState {
  /** Image identity (`connectionName/pathName`) — keys persistence + devtools. */
  id: string;
  /** Keycloak `sub` of the current user — scopes per-user sidecar writes and
   *  ownership guards on shared views. */
  currentUserId: string;
}

export type ViewerStore = ViewerStoreState &
  AnnotationsSlice &
  ViewSlice &
  ViewsSlice &
  CoreSlice &
  OverlaysSlice &
  ChannelsSlice;

/**
 * Slice creator typed for the viewer store's
 * `subscribeWithSelector → persist → immer → devtools → temporal` middleware
 * stack — `set` carries both the immer mutable draft and the devtools
 * action-label third argument. `temporal` (zundo) is innermost so it wraps the
 * store creator before any other middleware, giving it the raw state to
 * snapshot. Shared by every `slices/viewer.*.store`.
 */
export type ViewerSlice<T> = StateCreator<
  ViewerStore,
  [
    ["zustand/subscribeWithSelector", never],
    ["zustand/persist", unknown],
    ["zustand/immer", never],
    ["zustand/devtools", never],
    ["temporal", unknown],
  ],
  [],
  T
>;
