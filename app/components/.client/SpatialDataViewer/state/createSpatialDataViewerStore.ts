import type { SpatialData } from "@spatialdata/core";
import type { ViewState } from "@spatialdata/vis";
import { create } from "zustand";
import { devtools } from "zustand/middleware";

export const DEFAULT_ELEMENT_OPACITY = 1;

export interface SpatialElementConfig {
  elementType: "image" | "labels" | "points" | "shapes";
  elementKey: string;
  isVisible: boolean;
  opacity: number;
  /** Selected z plane for raster elements with a z axis (undefined = 2D element). */
  zIndex?: number;
  /** Plane count along z (from the first multiscale array); > 1 marks a z-bearing element. */
  zSize?: number;
  /** Zarr store view rooted at this raster element; present on raster kinds. */
  getStore?: () => unknown;
}

export interface SpatialDataViewerState {
  spatialData: SpatialData | null;
  coordinateSystem: string | null;
  viewState: ViewState | null;
  elements: Record<string, SpatialElementConfig>;
  isLoading: boolean;
  error: Error | null;

  setSpatialData: (spatialData: SpatialData) => void;
  setError: (error: Error) => void;
  setIsLoading: (isLoading: boolean) => void;
  setCoordinateSystem: (coordinateSystem: string) => void;
  setViewState: (viewState: ViewState) => void;
  setElementVisibility: (elementKey: string, isVisible: boolean) => void;
  setElementOpacity: (elementKey: string, opacity: number) => void;
  setElementZIndex: (elementKey: string, zIndex: number) => void;
  setElementZSize: (elementKey: string, zSize: number) => void;
}

const elementId = (elementType: string, elementKey: string) => `${elementType}:${elementKey}`;

export function selectDefaultCoordinateSystem(spatialData: SpatialData | null): string | null {
  const systems = spatialData?.coordinateSystems ?? [];
  if (systems.length === 0) return null;
  return systems.includes("global") ? "global" : systems[0];
}

/** Seed one config per spatial element, all visible at full opacity. */
export function elementsFromSpatialData(spatialData: SpatialData): SpatialElementConfig[] {
  const elements: SpatialElementConfig[] = [];
  for (const elementType of ["image", "labels", "points", "shapes"] as const) {
    const collection = spatialData[elementType === "image" ? "images" : elementType];
    if (!collection) continue;
    for (const elementKey of Object.keys(collection)) {
      elements.push({
        elementType,
        elementKey,
        isVisible: true,
        opacity: DEFAULT_ELEMENT_OPACITY,
      });
    }
  }
  return elements;
}

export function createSpatialDataViewerStore() {
  return create<SpatialDataViewerState>()(
    devtools(
      (set) => ({
        spatialData: null,
        coordinateSystem: null,
        viewState: null,
        elements: {},
        isLoading: true,
        error: null,

        setSpatialData: (spatialData) => {
          const elements = Object.fromEntries(
            elementsFromSpatialData(spatialData).map((e) => [
              elementId(e.elementType, e.elementKey),
              e,
            ]),
          );
          set(
            {
              spatialData,
              elements,
              coordinateSystem: selectDefaultCoordinateSystem(spatialData),
              isLoading: false,
              error: null,
            },
            false,
            "setSpatialData",
          );
        },
        setError: (error) => set({ error, isLoading: false }, false, "setError"),
        setIsLoading: (isLoading) => set({ isLoading }, false, "setIsLoading"),
        setCoordinateSystem: (coordinateSystem) =>
          set({ coordinateSystem }, false, "setCoordinateSystem"),
        setViewState: (viewState) => set({ viewState }, false, "setViewState"),
        setElementVisibility: (id, isVisible) =>
          set(
            (state) => {
              const element = state.elements[id];
              if (!element) return state;
              return { elements: { ...state.elements, [id]: { ...element, isVisible } } };
            },
            false,
            "setElementVisibility",
          ),
        setElementOpacity: (id, opacity) =>
          set(
            (state) => {
              const element = state.elements[id];
              if (!element) return state;
              return { elements: { ...state.elements, [id]: { ...element, opacity } } };
            },
            false,
            "setElementOpacity",
          ),
        setElementZIndex: (id, zIndex) =>
          set(
            (state) => {
              const element = state.elements[id];
              if (!element) return state;
              return { elements: { ...state.elements, [id]: { ...element, zIndex } } };
            },
            false,
            "setElementZIndex",
          ),
        setElementZSize: (id, zSize) =>
          set(
            (state) => {
              const element = state.elements[id];
              if (!element) return state;
              return { elements: { ...state.elements, [id]: { ...element, zSize } } };
            },
            false,
            "setElementZSize",
          ),
      }),
      { name: "SpatialDataViewerStore" },
    ),
  );
}

export type SpatialDataViewerStoreApi = ReturnType<typeof createSpatialDataViewerStore>;

export { elementId };
