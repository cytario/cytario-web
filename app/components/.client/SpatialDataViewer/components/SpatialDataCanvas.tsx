import type { RenderStack, ViewState } from "@spatialdata/vis";
import { SpatialCanvasViewer } from "@spatialdata/vis";

import { elementId } from "../state/createSpatialDataViewerStore";
import { useSpatialDataStore } from "../state/SpatialDataStoreContext";
import { LoaderView } from "~/components/Loader/LoaderView";

/** Build a render stack entry per visible element; opacity rides in props. */
function buildRenderStack(
  elements: Record<
    string,
    {
      elementType: "image" | "labels" | "points" | "shapes";
      elementKey: string;
      isVisible: boolean;
      opacity: number;
    }
  >,
): RenderStack {
  const entries = Object.values(elements)
    .filter((element) => element.isVisible)
    .map((element) => ({
      kind: "spatial" as const,
      id: elementId(element.elementType, element.elementKey),
      visible: true,
      source: {
        elementType: element.elementType,
        elementKey: element.elementKey,
      },
      props: { opacity: element.opacity },
    }));
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

  const onViewStateChange = (vs: ViewState) => setViewState(vs);

  return (
    <div className="relative grow h-full w-full overflow-clip">
      <SpatialCanvasViewer
        spatialData={spatialData}
        coordinateSystem={coordinateSystem}
        renderStack={buildRenderStack(elements)}
        viewState={viewState}
        onViewStateChange={onViewStateChange}
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  );
};
