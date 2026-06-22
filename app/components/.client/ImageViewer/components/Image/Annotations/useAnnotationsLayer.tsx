import { GeoJsonLayer } from "@deck.gl/layers";
import {
  DrawPointMode,
  DrawPolygonByDraggingMode,
  DrawPolygonMode,
  EditableGeoJsonLayer,
  ViewMode,
} from "@deck.gl-community/editable-layers";
import type { FeatureCollection } from "geojson";
import { useMemo } from "react";

import { classNameOf } from "../../../state/store/slices/viewer.annotations.store";
import { RGB, RGBA } from "../../../state/store/types";
import { useViewerStore } from "../../../state/store/ViewerStoreContext";
import { type AnnotationFeature } from "~/utils/db/getAnnotationsWasm";

const MODE_CLASSES = {
  view: ViewMode,
  "draw-polygon": DrawPolygonMode,
  "draw-freehand": DrawPolygonByDraggingMode,
  "draw-point": DrawPointMode,
} as const;

const DEFAULT_COLOR: RGB = [120, 120, 120];

// Concentric selection outlines, widest first (drawn underneath) → narrowest on
// top, giving a high-contrast triple ring readable on any background.
const SELECTION_RINGS: { width: number; color: RGBA }[] = [
  { width: 8, color: [255, 255, 255, 255] },
  { width: 4.5, color: [56, 189, 248, 255] },
  { width: 1.5, color: [255, 255, 255, 255] },
];

const classColor = (feature: AnnotationFeature): RGB =>
  feature.properties?.classification?.color ?? DEFAULT_COLOR;

const withAlpha = ([r, g, b]: RGB, alpha: number): RGBA => [r, g, b, alpha];

/**
 * Stamps identity onto edited features (per the sidecar schema): any feature
 * lacking an `id` gets a fresh `id` + `createdAt`/`updatedAt`, and a feature at
 * a changed index gets its `updatedAt` bumped. Draw modes emit bare geometry,
 * so feature identity is assigned here on the way to the store. `id`-less is the
 * robust signal for "new" — it doesn't depend on the edit's featureIndexes.
 */
const stampEdit = (
  features: AnnotationFeature[],
  changed: number[] | undefined,
): AnnotationFeature[] => {
  const now = new Date().toISOString();
  return features.map((feature, i) => {
    const properties = feature.properties ?? {};
    if (!properties.id) {
      return {
        ...feature,
        properties: { ...properties, id: crypto.randomUUID(), createdAt: now, updatedAt: now },
      };
    }
    if (changed?.includes(i)) {
      return { ...feature, properties: { ...properties, updatedAt: now } };
    }
    return feature;
  });
};

/**
 * Builds the `EditableGeoJsonLayer` for the image's annotations, rendering and
 * editing the shared working set held in the viewer store. Coordinates are
 * level-0 pixel space (CARTESIAN, matching the viewer's `OrthographicView`).
 * Edits flow back through `onEdit` → `setAnnotationFeatures`, which autosaves.
 */
export const useAnnotationsLayer = (imagePanelId: number) => {
  const features = useViewerStore((s) => s.annotationFeatures);
  const mode = useViewerStore((s) => s.annotationMode);
  const opacity = useViewerStore((s) => s.annotationOpacity);
  const hiddenClasses = useViewerStore((s) => s.annotationHiddenClasses);
  const selectedIndexes = useViewerStore((s) => s.annotationSelectedIndexes);
  const setFeatures = useViewerStore((s) => s.setAnnotationFeatures);
  const setSelectedIndexes = useViewerStore((s) => s.setAnnotationSelectedIndexes);

  return useMemo(() => {
    const data: FeatureCollection = { type: "FeatureCollection", features };
    const hidden = new Set(hiddenClasses);
    const isHidden = (f: AnnotationFeature) => hidden.has(classNameOf(f));

    const editableLayer = new EditableGeoJsonLayer({
      id: `annotations-${imagePanelId}`,
      data,
      mode: MODE_CLASSES[mode],
      selectedFeatureIndexes: selectedIndexes,
      opacity,
      coordinateSystem: "cartesian",
      pickable: true,
      getFillColor: (f) =>
        withAlpha(classColor(f as AnnotationFeature), isHidden(f as AnnotationFeature) ? 0 : 60),
      getLineColor: (f) =>
        withAlpha(classColor(f as AnnotationFeature), isHidden(f as AnnotationFeature) ? 0 : 255),
      getLineWidth: 2,
      lineWidthMinPixels: 1,
      pointRadiusMinPixels: 4,
      updateTriggers: {
        getFillColor: hiddenClasses,
        getLineColor: hiddenClasses,
      },
      onEdit: ({ updatedData, editType, editContext }) => {
        const changed: number[] | undefined = editContext?.featureIndexes;
        setFeatures(stampEdit(updatedData.features as AnnotationFeature[], changed));
        if (editType === "addFeature") {
          setSelectedIndexes([updatedData.features.length - 1]);
        }
      },
    });

    // Concentric outline halo on the selected feature(s) — selection isn't
    // visibly rendered in view mode, so stack GeoJsonLayers (widest first) over
    // the editable layer. Hidden features are excluded so a halo never reveals one.
    const selectedFeatures = selectedIndexes
      .map((i) => features[i])
      .filter((f): f is AnnotationFeature => Boolean(f) && !isHidden(f));

    const highlightLayers =
      selectedFeatures.length === 0
        ? []
        : SELECTION_RINGS.map(
            (ring, r) =>
              new GeoJsonLayer({
                id: `annotations-${imagePanelId}-selection-${r}`,
                data: { type: "FeatureCollection", features: selectedFeatures },
                coordinateSystem: "cartesian",
                pickable: false,
                stroked: true,
                filled: false,
                getLineColor: ring.color,
                getLineWidth: ring.width,
                lineWidthUnits: "pixels",
                lineWidthMinPixels: ring.width,
                pointType: "circle",
                getPointRadius: 4,
                pointRadiusUnits: "pixels",
              }),
          );

    return [editableLayer, ...highlightLayers];
  }, [
    features,
    mode,
    opacity,
    hiddenClasses,
    selectedIndexes,
    imagePanelId,
    setFeatures,
    setSelectedIndexes,
  ]);
};
