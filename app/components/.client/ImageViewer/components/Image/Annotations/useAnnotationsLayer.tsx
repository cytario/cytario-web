import { GeoJsonLayer } from "@deck.gl/layers";
import {
  DrawPolygonByDraggingMode,
  DrawPolygonMode,
  EditableGeoJsonLayer,
  ViewMode,
} from "@deck.gl-community/editable-layers";
import type { FeatureCollection } from "geojson";
import { useMemo } from "react";

import { ClickOrDragPointMode } from "./clickOrDragPointMode";
import {
  classNameOf,
  selectUserFeatures,
} from "../../../state/store/slices/viewer.annotations.store";
import { RGB, RGBA } from "../../../state/store/types";
import { useViewerStore } from "../../../state/store/ViewerStoreContext";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import { type AnnotationFeature } from "~/utils/db/getAnnotationsWasm";

const MODE_CLASSES = {
  view: ViewMode,
  "draw-polygon": DrawPolygonMode,
  "draw-freehand": DrawPolygonByDraggingMode,
  "draw-point": ClickOrDragPointMode,
} as const;

const DEFAULT_COLOR: RGB = [120, 120, 120];

// Edit types that change committed geometry and must be persisted. An allowlist
// fails safe: any other type (tentative draw events like addTentativePosition/
// updateTentativeFeature, or cancelFeature/invalidPolygon/invalidHole — all
// carrying unchanged data) is ignored, so we never persist a no-op and rebuild
// the layer mid-stroke (which drops the active draw). Today's modes only emit
// `addFeature`; the rest are forward-compat for modify/translate modes.
const COMMITTING_EDITS = new Set([
  "addFeature",
  "addPosition",
  "removePosition",
  "movePosition",
  "finishMovePosition",
  "addHole",
  "unionGeometry",
]);

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
 * Edits flow back through `onEdit` → `updateUserFeatures(ownUserId, …)`, which
 * the sync middleware diffs and autosaves to the user's own sidecar.
 */
export const useAnnotationsLayer = (imagePanelId: number) => {
  const ownUserId = useCurrentUser()?.sub;
  const features = useViewerStore(selectUserFeatures(ownUserId));
  const annotationsByUser = useViewerStore((s) => s.annotationsByUser);
  const annotationView = useViewerStore((s) => s.annotationView);
  const mode = useViewerStore((s) => s.annotationMode);
  const selectedIds = useViewerStore((s) => s.annotationSelectedIds);
  const updateUserFeatures = useViewerStore((s) => s.updateUserFeatures);
  const setSelectedIds = useViewerStore((s) => s.setAnnotationSelectedIds);

  return useMemo(() => {
    const data: FeatureCollection = { type: "FeatureCollection", features };
    const ownView = ownUserId ? annotationView[ownUserId] : undefined;
    const ownHidden = new Set(ownView?.hiddenClasses ?? []);
    const isHidden = (f: AnnotationFeature) => ownHidden.has(classNameOf(f));

    // Resolve selected ids → array indexes only here, at the deck boundary.
    const selected = new Set(selectedIds);
    const isSelected = (f: AnnotationFeature) =>
      !!f.properties?.id && selected.has(f.properties.id);
    const selectedFeatureIndexes = features.reduce<number[]>((acc, f, i) => {
      if (isSelected(f)) acc.push(i);
      return acc;
    }, []);

    const editableLayer = new EditableGeoJsonLayer({
      id: `annotations-${imagePanelId}`,
      data,
      mode: MODE_CLASSES[mode],
      selectedFeatureIndexes,
      opacity: ownView?.opacity ?? 1,
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
        getFillColor: ownView?.hiddenClasses,
        getLineColor: ownView?.hiddenClasses,
      },

      onEdit: ({ updatedData, editType, editContext }) => {
        // Persist only committing edits — anything else (tentative draw events,
        // cancel/invalid) carries unchanged data; persisting it would rebuild
        // this layer mid-stroke and drop the active draw.
        if (!COMMITTING_EDITS.has(editType)) return;

        if (!ownUserId) return; // edits route to the current user's own key
        const changed: number[] | undefined = editContext?.featureIndexes;
        const stamped = stampEdit(updatedData.features as AnnotationFeature[], changed);
        updateUserFeatures(ownUserId, stamped);
        if (editType === "addFeature") {
          const newId = stamped[stamped.length - 1]?.properties?.id;
          if (newId) setSelectedIds([newId]);
        }
      },
    });

    // Other users' sets: one read-only layer each (not pickable, not editable,
    // dimmer than own), drawn beneath the editable layer. Hidden classes fade to
    // alpha 0, mirroring the editable layer.
    const peerLayers = Object.entries(annotationsByUser)
      .filter(([userId]) => userId !== ownUserId)
      .map(([userId, peerFeatures]) => {
        const peerView = annotationView[userId];
        const peerHidden = new Set(peerView?.hiddenClasses ?? []);
        const isPeerHidden = (f: AnnotationFeature) => peerHidden.has(classNameOf(f));
        return new GeoJsonLayer({
          id: `annotations-${imagePanelId}-peer-${userId}`,
          data: { type: "FeatureCollection", features: peerFeatures },
          coordinateSystem: "cartesian",
          pickable: false,
          opacity: peerView?.opacity ?? 1,
          stroked: true,
          filled: true,
          getFillColor: (f) =>
            withAlpha(
              classColor(f as AnnotationFeature),
              isPeerHidden(f as AnnotationFeature) ? 0 : 40,
            ),
          getLineColor: (f) =>
            withAlpha(
              classColor(f as AnnotationFeature),
              isPeerHidden(f as AnnotationFeature) ? 0 : 200,
            ),
          getLineWidth: 2,
          lineWidthMinPixels: 1,
          pointType: "circle",
          getPointRadius: 4,
          pointRadiusUnits: "pixels",
          pointRadiusMinPixels: 4,
          updateTriggers: {
            getFillColor: peerView?.hiddenClasses,
            getLineColor: peerView?.hiddenClasses,
          },
        });
      });

    // Concentric outline halo on the selected feature(s) — selection isn't
    // visibly rendered in view mode, so stack GeoJsonLayers (widest first) over
    // the editable layer. Hidden features are excluded so a halo never reveals one.
    const selectedFeatures = features.filter((f) => isSelected(f) && !isHidden(f));

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

    return [...peerLayers, editableLayer, ...highlightLayers];
  }, [
    features,
    annotationsByUser,
    annotationView,
    mode,
    selectedIds,
    imagePanelId,
    ownUserId,
    updateUserFeatures,
    setSelectedIds,
  ]);
};
