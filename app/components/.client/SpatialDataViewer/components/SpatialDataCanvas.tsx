import type { RenderStack, ViewState } from "@spatialdata/vis";
import { SpatialCanvasViewer } from "@spatialdata/vis";
import { useCallback, useMemo } from "react";

import { isZBearing } from "./useResolveZSizes";
import { elementId } from "../state/createSpatialDataViewerStore";
import { useSpatialDataStore } from "../state/SpatialDataStoreContext";
import { LoaderView } from "~/components/Loader/LoaderView";

const VIEWER_STYLE = { width: "100%", height: "100%" } as const;

export interface RenderStackElementConfig {
  elementType: "image" | "labels" | "points" | "shapes";
  elementKey: string;
  isVisible: boolean;
  opacity: number;
  zIndex?: number;
  zSize?: number;
}

/** Build a render stack entry per visible element; opacity and z ride in props. */
export function buildRenderStack(elements: Record<string, RenderStackElementConfig>): RenderStack {
  const entries = Object.values(elements)
    .filter((element) => element.isVisible)
    .map((element) => {
      // Channel selections are clamped against the loader's axis sizes, so a z
      // on a 2D element is dropped downstream — but omitting it here keeps
      // single-plane layers on the no-channels default path unchanged.
      const hasZAxis = isZBearing(element);
      return {
        kind: "spatial" as const,
        id: elementId(element.elementType, element.elementKey),
        visible: true,
        source: {
          elementType: element.elementType,
          elementKey: element.elementKey,
        },
        props: hasZAxis
          ? {
              opacity: element.opacity,
              channels: { selections: [{ z: element.zIndex ?? 0 }] },
            }
          : { opacity: element.opacity },
      };
    });
  return { schemaVersion: 1, entries };
}

export const SpatialDataCanvas = () => {
  const spatialData = useSpatialDataStore((s) => s.spatialData);
  const coordinateSystem = useSpatialDataStore((s) => s.coordinateSystem);
  const viewState = useSpatialDataStore((s) => s.viewState);
  const elements = useSpatialDataStore((s) => s.elements);
  const isLoading = useSpatialDataStore((s) => s.isLoading);
  const error = useSpatialDataStore((s) => s.error);
  const setViewState = useSpatialDataStore((s) => s.setViewState);

  // The viewer diffs its layer config by prop identity: a fresh renderStack per
  // render re-runs its reconcile effect on every store update, which loops with
  // the loader's notify-driven re-renders (max update depth exceeded).
  const renderStack = useMemo(() => buildRenderStack(elements), [elements]);
  const handleViewStateChange = useCallback((vs: ViewState) => setViewState(vs), [setViewState]);

  if (error) {
    return (
      <div
        role="alert"
        className="flex flex-col items-center justify-center h-full gap-2 p-8 text-muted-foreground"
      >
        <p className="font-semibold">Failed to load SpatialData</p>
        <p className="text-sm">{error.message}</p>
      </div>
    );
  }

  if (isLoading || !spatialData) {
    return <LoaderView label="Loading spatial data…" />;
  }

  return (
    <div className="relative grow h-full w-full overflow-clip">
      <SpatialCanvasViewer
        spatialData={spatialData}
        coordinateSystem={coordinateSystem}
        renderStack={renderStack}
        viewState={viewState}
        onViewStateChange={handleViewStateChange}
        style={VIEWER_STYLE}
      />
    </div>
  );
};
