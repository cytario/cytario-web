import type { PickingInfo } from "@deck.gl/core";
import { EditableGeoJsonLayer } from "@deck.gl-community/editable-layers";
import { useMemo } from "react";

import { setIdFromLayerId } from "./pickFeaturesAt";
import { buildAnnotationsLayers, stampEdit } from "../../../export/buildAnnotationsLayers";
import {
  annotationNameOf,
  classColor as registeredClassColor,
  classNameOf,
  isReservedClassName,
  selectActiveSetFeatures,
  selectSetClasses,
  UNCLASSIFIED,
  UNCLASSIFIED_COLOR,
} from "../../../state/store/annotations/annotations.store";
import { useViewerStore } from "../../../state/store/core/ViewerStoreContext";
import { select } from "../../../state/store/selectors";
import { type CytarioLayerResult, type LayerTooltipItem } from "../../../state/store/types";
import { RGB, RGBA } from "../../../state/store/types";
import { useCanAnnotate } from "../../../utils/useCanAnnotate";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import {
  type AnnotationClassification,
  validAnnotationFeatures,
} from "~/utils/db/annotationSchema";
import { type AnnotationFeature } from "~/utils/db/getAnnotationsWasm";

// Allowlist of edit types that change committed geometry — anything else
// (tentative draws, cancel/invalid) is ignored so the layer is never rebuilt mid-stroke.
const COMMITTING_EDITS = new Set([
  "addFeature",
  "addPosition",
  "removePosition",
  "movePosition",
  "finishMovePosition",
  "addHole",
]);

const classColor = (feature: AnnotationFeature): RGB =>
  feature.properties?.classification?.color ?? UNCLASSIFIED_COLOR;

/** Builds the editable annotations layer over the shared working set in the viewer
 *  store. With `interactive: false` (preview/minimap decks/export) the own set renders
 *  read-only and picking is disabled so clicks pan the preview. */
export const useAnnotationsLayer = (
  imagePanelId: number,
  interactive = true,
): CytarioLayerResult => {
  const ownUserId = useCurrentUser()?.sub;
  const canAnnotate = useCanAnnotate();
  const activeSetId = useViewerStore((s) => s.activeSetId);
  const features = useViewerStore(selectActiveSetFeatures);
  const annotationSets = useViewerStore((s) => s.annotationSets);
  const annotationView = useViewerStore((s) => s.annotationView);
  const layersStates = useViewerStore(select.layersStates);
  const panelLayersStateIndex = useViewerStore((state) => state.imagePanels)[imagePanelId];
  const annotationsOpacity = layersStates[panelLayersStateIndex]?.annotationsOpacity ?? 1;
  const showOutline = layersStates[panelLayersStateIndex]?.showAnnotationOutline ?? true;
  const mode = useViewerStore((s) => s.annotationMode);
  const stampWidthPx = useViewerStore((s) => s.annotationStampSize.widthPx);
  const stampHeightPx = useViewerStore((s) => s.annotationStampSize.heightPx);
  const selectedIds = useViewerStore((s) => s.annotationSelectedIds);
  const ensureOwnSet = useViewerStore((s) => s.ensureOwnSet);
  const updateSetFeatures = useViewerStore((s) => s.updateSetFeatures);
  const setSelectedIds = useViewerStore((s) => s.setAnnotationSelectedIds);
  const showAnnotationClass = useViewerStore((s) => s.showAnnotationClass);
  const activeClass = useViewerStore((s) => s.annotationActiveClass);
  const setClasses = useViewerStore(selectSetClasses(activeSetId));

  // The registry is the source of truth so a freshly created, still-empty class stamps too;
  // member features are only the fallback for unregistered legacy names.
  const activeClassification = useMemo<AnnotationClassification | null>(() => {
    if (!activeClass || isReservedClassName(activeClass)) return null;
    const color = registeredClassColor(setClasses, features, activeClass);
    return color ? { name: activeClass, color } : null;
  }, [activeClass, setClasses, features]);

  return useMemo(() => {
    const ownView = activeSetId ? annotationView[activeSetId] : undefined;
    const onEdit: EditableGeoJsonLayer["props"]["onEdit"] = ({
      updatedData,
      editType,
      editContext,
    }) => {
      if (!COMMITTING_EDITS.has(editType)) return;

      if (!ownUserId) return;
      const changed: number[] | undefined = editContext?.featureIndexes;
      const stamped = stampEdit(
        updatedData.features as AnnotationFeature[],
        changed,
        activeClassification,
      );
      // Degenerate/aborted draws (empty ring, `[[null]]`) are dropped
      // and never written to S3.
      const valid = validAnnotationFeatures(stamped);
      const setId = ensureOwnSet();
      updateSetFeatures(setId, valid);
      if (editType === "addFeature") {
        const newId = stamped[stamped.length - 1]?.id;
        if (newId && valid.some((f) => f.id === newId)) {
          setSelectedIds([newId]);
          // Never draw into a hidden class — reveal the class the region landed in.
          showAnnotationClass(setId, activeClassification?.name ?? UNCLASSIFIED);
        }
      }
    };

    const layers = buildAnnotationsLayers({
      features,
      annotationSets,
      activeSetId,
      annotationView,
      annotationMode: mode,
      annotationStampSize: { widthPx: stampWidthPx, heightPx: stampHeightPx },
      annotationSelectedIds: selectedIds,
      annotationsOpacity,
      showOutline,
      imagePanelId,
      interactive: interactive && canAnnotate,
      onEdit,
    });

    // Per-user hidden-class lookup so `getTooltipItems` can skip features that are
    // visually transparent (hidden class → alpha 0) and not block layers beneath
    // them. Scoped to the feature's OWN set: another set's hidden class must not
    // hide this set's feature.
    const hiddenByUser = new Map<string, Set<string>>();
    if (activeSetId) hiddenByUser.set(activeSetId, new Set(ownView?.hiddenClasses ?? []));
    for (const set of annotationSets) {
      if (set.id !== activeSetId) {
        hiddenByUser.set(set.id, new Set(annotationView[set.id]?.hiddenClasses ?? []));
      }
    }

    const isHiddenFeature = (f: AnnotationFeature, layerId: string): boolean => {
      const setId = setIdFromLayerId(layerId, annotationSets, activeSetId);
      const hidden = setId ? hiddenByUser.get(setId) : undefined;
      return hidden?.has(classNameOf(f)) ?? false;
    };

    const getTooltipItems = (info: PickingInfo): LayerTooltipItem[] => {
      const f = info.object as AnnotationFeature | undefined;
      if (!f) return [];
      if (isHiddenFeature(f, info.layer?.id ?? "")) return [];
      const [r, g, b] = classColor(f);
      const cls = classNameOf(f);
      return [
        {
          type: "Annotations" as const,
          id: annotationNameOf(f),
          values: { [cls]: { value: "", color: [r, g, b] } },
          geometry: f.geometry,
          geometryColor: [r, g, b],
        },
      ];
    };

    return { layers, getTooltipItems };
  }, [
    features,
    annotationSets,
    activeSetId,
    annotationView,
    annotationsOpacity,
    showOutline,
    mode,
    stampWidthPx,
    stampHeightPx,
    selectedIds,
    imagePanelId,
    ownUserId,
    canAnnotate,
    ensureOwnSet,
    updateSetFeatures,
    setSelectedIds,
    showAnnotationClass,
    activeClassification,
    interactive,
  ]);
};

export type { RGBA };
