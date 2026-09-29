import { flyToFeaturesViewState } from "./flyToFeature";
import { joinFeaturesInSet } from "./joinFeatures";
import { useViewerStore, useViewerStoreApi } from "../../state/store/core/ViewerStoreContext";
import type { AnnotationFeature } from "~/utils/db/getAnnotationsWasm";

interface UseAnnotationFeatureActionsProps {
  setId: string;
  features: AnnotationFeature[];
}

/** Selection-aware actions on one annotation set's features, shared by the
 *  sidebar list and the canvas context menu: when the actioned feature is part
 *  of a multi-selection the action covers the whole selection, else just that
 *  feature. */
export const useAnnotationFeatureActions = ({
  setId,
  features,
}: UseAnnotationFeatureActionsProps) => {
  const selectedIds = useViewerStore((s) => s.annotationSelectedIds);
  const setSelectedIds = useViewerStore((s) => s.setAnnotationSelectedIds);
  const setSelectionAnchor = useViewerStore((s) => s.setAnnotationSelectionAnchor);
  const updateSetFeatures = useViewerStore((s) => s.updateSetFeatures);
  const setClassForIds = useViewerStore((s) => s.setAnnotationClassForIds);
  const setViewState = useViewerStore((s) => s.setViewStateActive);
  const viewerStore = useViewerStoreApi();

  const actionTargets = (feature: AnnotationFeature): string[] =>
    selectedIds.length > 1 && selectedIds.includes(feature.id) ? selectedIds : [feature.id];

  const zoomToFeature = (feature: AnnotationFeature) => {
    // Select without routing through a selection gesture — zoom is navigation,
    // so it must not move the Shift-range anchor.
    const ids = new Set(actionTargets(feature));
    setSelectedIds([...ids]);
    // Read the view state imperatively via the store API: subscribing to
    // `viewStateActive` re-rendered the whole grouped annotation list on every
    // zoom/pan frame, though it is only needed inside this click handler.
    const viewState = viewerStore?.getState().viewStateActive;
    if (!viewState) return;
    const geometries = features.filter((f) => ids.has(f.id)).map((f) => f.geometry);
    const next = flyToFeaturesViewState(geometries, viewState);
    if (next) setViewState(next);
  };

  const deleteFeatures = (feature: AnnotationFeature) => {
    const ids = new Set(actionTargets(feature));
    setSelectedIds([]);
    setSelectionAnchor(null);
    updateSetFeatures(
      setId,
      features.filter((f) => !ids.has(f.id)),
    );
  };

  const classify = (feature: AnnotationFeature, name: string) =>
    setClassForIds(setId, actionTargets(feature), name);

  const clearClass = (feature: AnnotationFeature) =>
    setClassForIds(setId, actionTargets(feature), null);

  /** Join an explicit id list (per-class offers compute their own groups). */
  const joinIds = (ids: string[]): string | null => {
    if (!viewerStore) return null;
    return joinFeaturesInSet(viewerStore, setId, ids);
  };

  return { actionTargets, zoomToFeature, deleteFeatures, classify, clearClass, joinIds };
};
