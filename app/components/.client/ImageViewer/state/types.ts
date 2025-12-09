import { OrthographicViewState } from "@deck.gl/core";

import { Image, Loader } from "./ome.tif.types";

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

export interface ViewerStoreState {
  id: string;

  isViewerLoading: boolean;

  metadata: Image | null;
  loader: Loader | null;
  error: Error | null;

  viewStatePreview: ViewState | null;
  viewStateActive: ViewState | null;

  selectedChannelId: keyof ChannelsState | null;

  imagePanelIndex: number;
  imagePanels: number[];

  cursorPosition: { x: number; y: number } | null;

  // after
  layersStates: {
    channels: ChannelsState;
    channelIds: string[];
    overlays: OverlaysState;
    channelsOpacity: number;
    overlaysFillOpacity: number;
    isChannelsLoading: number;
    isOverlaysLoading: number;
  }[];
}

interface ViewerStoreActions {
  setSelectedChannelId: (selectedChannelId: keyof ChannelsState | null) => void;

  setIsViewerLoading: (val: boolean) => void;
  setIsChannelsLoading: (imagePanelId: number, count: number) => void;
  setIsOverlaysLoading: (imagePanelId: number, count: number) => void;

  setError: (error: Error | null) => void;

  setMetadata: (metadata: Image) => void;
  setLoader: (loader: Loader) => void;

  setViewStatePreview: (viewState: ViewState) => void;
  setViewStateActive: (viewState: ViewState) => void;

  setActiveImagePanelId: (imagePanelIndex: number) => void;

  setCursorPosition: (position: { x: number; y: number } | null) => void;

  addImagePanel: () => void;

  addChannelsState: () => void;
  removeChannelsState: (channelsStateIndex: number) => void;
  setActiveChannelsStateIndex: (channelsStateIndex: number) => void;
  removeImagePanel: (index: number) => void;

  setContrastLimits: (contrastLimits: ByteDomain) => void;
  resetContrastLimits: () => void;

  setChannelVisibility: (
    key: keyof ChannelsStateColumns,
    isVisible: boolean
  ) => void;

  setMarkerVisibility: (
    fileName: string,
    markerName: string,
    isVisible: boolean
  ) => void;

  setChannelColor: (key: keyof ChannelsState, color: RGBA) => void;
  setMarkerColor: (fileName: string, markerName: string, color: RGBA) => void;

  addOverlaysState: (overlaysState: OverlaysState) => void;
  updateOverlaysState: (overlayId: string, overlayState: OverlayState) => void;
  removeOverlaysState: (overlaysStateId: string) => void;

  setOverlaysFillOpacity: (fillOpacity: number) => void;
  setChannelsOpacity: (opacity: number) => void;
}

export type ViewerStore = ViewerStoreState & ViewerStoreActions;
