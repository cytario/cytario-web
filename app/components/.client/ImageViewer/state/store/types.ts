import { OrthographicViewState } from "@deck.gl/core";
import type { StateCreator } from "zustand";

import type { AnnotationsSlice } from "./slices/viewer.annotations.store";
import type { ChannelsSlice } from "./slices/viewer.channels.store";
import type { CoreSlice } from "./slices/viewer.core.store";
import type { OverlaysSlice } from "./slices/viewer.overlays.store";
import type { ViewSlice } from "./slices/viewer.view.store";

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
}

export type OverlayState = Record<string, CellMarker>; // Dateset ~ File
export type OverlaysState = Record<string, OverlayState>; // Datasets

export type AnnotationMode = "view" | "draw-polygon" | "draw-freehand" | "draw-point";

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
