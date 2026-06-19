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
  domains: Readonly<ByteDomain>[];
  selections: Selection[];
  histograms: number[][];
}

export interface ChannelConfig {
  isInitialized: boolean;
  isLoading: boolean;
  isVisible: boolean;
  selection: Readonly<Selection>;
  domain: Readonly<ByteDomain>;
  histogram: number[];
  contrastLimitsInitial: Readonly<ByteDomain>;
  contrastLimits: ByteDomain;
  color: RGB;
}

export type ChannelsState = Record<string, ChannelConfig>;

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
}

export type ViewerStore = ViewerStoreState &
  AnnotationsSlice &
  ViewSlice &
  CoreSlice &
  OverlaysSlice &
  ChannelsSlice;

/**
 * Slice creator typed for the viewer store's `persist → immer → devtools`
 * middleware stack — `set` carries both the immer mutable draft and the
 * devtools action-label third argument. Shared by every `slices/viewer.*.store`.
 */
export type ViewerSlice<T> = StateCreator<
  ViewerStore,
  [["zustand/persist", unknown], ["zustand/immer", never], ["zustand/devtools", never]],
  [],
  T
>;
