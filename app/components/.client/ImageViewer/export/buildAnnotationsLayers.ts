import type { Layer } from "@deck.gl/core";
import { GeoJsonLayer } from "@deck.gl/layers";
import {
  DrawPolygonByDraggingMode,
  DrawPolygonMode,
  EditableGeoJsonLayer,
  ViewMode,
} from "@deck.gl-community/editable-layers";
import type { Feature, FeatureCollection } from "geojson";

import { ClickOrDragPointMode } from "../components/canvas/Annotations/clickOrDragPointMode";
import { StampBoxMode } from "../components/canvas/Annotations/stampBoxMode";
import { classNameOf, UNCLASSIFIED_COLOR } from "../state/store/annotations/annotations.store";
import type { AnnotationMode, RGBA, RGB, ViewerStore } from "../state/store/types";
import type { AnnotationClassification } from "~/utils/db/annotationSchema";
import { type AnnotationFeature } from "~/utils/db/getAnnotationsWasm";

export const ANNOTATION_MODE_CLASSES = {
  view: ViewMode,
  inspect: ViewMode,
  "draw-polygon": DrawPolygonMode,
  "draw-freehand": DrawPolygonByDraggingMode,
  "draw-point": ClickOrDragPointMode,
  "draw-box": StampBoxMode,
} as const;

// Achromatic (not a hue) rings so they never collide with classification colors and
// stay legible on any background; drawn beneath the feature's own color line.
// `width` = polygon stroke (px); `radius` = concentric ring radius for points.
const SELECTION_RINGS: { width: number; radius: number; color: RGBA }[] = [
  { width: 9, radius: 9, color: [255, 255, 255, 255] },
  { width: 6, radius: 7.5, color: [0, 0, 0, 255] },
  { width: 3.5, radius: 6, color: [255, 255, 255, 255] },
];

const classColor = (feature: AnnotationFeature): RGB =>
  feature.properties?.classification?.color ?? UNCLASSIFIED_COLOR;

const withAlpha = ([r, g, b]: RGB, alpha: number): RGBA => [r, g, b, alpha];

/** Assigns identity to edited features: fresh id/createdAt for new ones, updatedAt
 * bump for changed ones. Draw modes emit bare geometry, so identity is stamped here. */
export const stampEdit = (
  features: AnnotationFeature[],
  changed: number[] | undefined,
  active: AnnotationClassification | null,
): AnnotationFeature[] => {
  const now = new Date().toISOString();
  const takenNames = new Set<string>();
  for (const f of features) {
    const name = f.properties?.name;
    if (typeof name === "string" && name.length > 0) takenNames.add(name);
  }
  let nameCounter = 1;
  const nextName = (): string => {
    while (takenNames.has(String(nameCounter).padStart(4, "0"))) nameCounter++;
    const name = String(nameCounter).padStart(4, "0");
    takenNames.add(name);
    return name;
  };
  return features.map((feature, i) => {
    const properties = feature.properties ?? {};
    if (!feature.id) {
      return {
        ...feature,
        id: crypto.randomUUID(),
        properties: {
          ...properties,
          name: nextName(),
          ...(active ? { classification: active } : {}),
          createdAt: now,
          updatedAt: now,
        },
      };
    }
    if (changed?.includes(i)) {
      return { ...feature, properties: { ...properties, updatedAt: now } };
    }
    return feature;
  });
};

export interface AnnotationLayerInputs {
  /** Own-set features (active set). */
  features: AnnotationFeature[];
  /** Every annotation set — peers render read-only beneath the own layer. */
  annotationSets: ViewerStore["annotationSets"];
  activeSetId: string | null;
  /** Per-set view state (hidden classes), keyed by `setId`. */
  annotationView: ViewerStore["annotationView"];
  annotationMode: AnnotationMode;
  annotationStampSize: { widthPx: number; heightPx: number };
  annotationSelectedIds: string[];
  annotationsOpacity: number;
  showOutline: boolean;
  imagePanelId: number;
  /** Own set is editable (draw modes active); false renders read-only + unpickable. */
  interactive: boolean;
  /** Classification new draws are placed into (own set, interactive only). */
  activeClassification: AnnotationClassification | null;
  /** The own set's `EditableGeoJsonLayer.onEdit` — committed draws, moves, deletes. */
  onEdit: EditableGeoJsonLayer["props"]["onEdit"];
}

/**
 * Builds the annotation layers (selection halo + read-only peers + own editable
 * or read-only layer) — the single construction path shared by the live
 * `useAnnotationsLayer` hook and the off-screen export, so the exported
 * annotation rendering cannot drift from the on-screen composite.
 */
export const buildAnnotationsLayers = ({
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
  interactive,
  activeClassification,
  onEdit,
}: AnnotationLayerInputs): Layer[] => {
  const data: FeatureCollection = { type: "FeatureCollection", features };
  const ownView = activeSetId ? annotationView[activeSetId] : undefined;

  const selected = new Set(selectedIds);
  const isSelected = (f: AnnotationFeature) => !!f.id && selected.has(f.id);

  const paint = (hiddenClasses: string[] | undefined, fillAlpha: number, lineAlpha: number) => {
    const hidden = new Set(hiddenClasses ?? []);
    const colorAt = (f: Feature, alpha: number): RGBA =>
      withAlpha(
        classColor(f as AnnotationFeature),
        hidden.has(classNameOf(f as AnnotationFeature)) ? 0 : alpha,
      );
    return {
      coordinateSystem: "cartesian" as const,
      pickable: interactive,
      getFillColor: (f: Feature) => colorAt(f, fillAlpha),
      getLineColor: (f: Feature) => colorAt(f, lineAlpha),
      getLineWidth: 2,
      lineWidthMinPixels: 1,
      pointRadiusMinPixels: 4,
      updateTriggers: { getFillColor: hiddenClasses, getLineColor: hiddenClasses },
    };
  };

  const ownFill = Math.round(annotationsOpacity * 255);
  const ownLine = showOutline ? 255 : 0;
  const selectedFeatureIndexes = features.reduce<number[]>((acc, f, i) => {
    if (isSelected(f)) acc.push(i);
    return acc;
  }, []);

  const ownLayer = !interactive
    ? new GeoJsonLayer({
        id: `annotations-${imagePanelId}`,
        data,
        ...paint(ownView?.hiddenClasses, ownFill, ownLine),
        stroked: true,
        filled: true,
        pointType: "circle",
        getPointRadius: 4,
        pointRadiusUnits: "pixels",
      })
    : new EditableGeoJsonLayer({
        id: `annotations-${imagePanelId}`,
        data,
        mode: ANNOTATION_MODE_CLASSES[mode],
        modeConfig:
          mode === "draw-box"
            ? {
                dragToDraw: true,
                stampWidthPx: stampWidthPx,
                stampHeightPx: stampHeightPx,
              }
            : undefined,
        selectedFeatureIndexes,
        ...paint(ownView?.hiddenClasses, ownFill, ownLine),
        onEdit,
      });

  // Peer sets: read-only (selectable + hoverable, not editable), dimmer than own,
  // drawn beneath the editable layer. Hidden classes fade to alpha 0, mirroring own.
  const peerLayers = annotationSets
    .filter((s) => s.id !== activeSetId)
    .map((set) => {
      const peerView = annotationView[set.id];
      return new GeoJsonLayer({
        id: `annotations-${imagePanelId}-peer-${set.id}`,
        data: { type: "FeatureCollection", features: set.features },
        ...paint(
          peerView?.hiddenClasses,
          Math.round(annotationsOpacity * 170),
          showOutline ? 200 : 0,
        ),
        stroked: true,
        filled: true,
        pointType: "circle",
        getPointRadius: 4,
        pointRadiusUnits: "pixels",
      });
    });

  // Selection halo (selection isn't visibly rendered in view mode) spans own + peer
  // sets; hidden features are excluded so a halo never reveals one.
  const ownHidden = new Set(ownView?.hiddenClasses ?? []);
  const selectedFeatures: AnnotationFeature[] = [
    ...features.filter((f) => isSelected(f) && !ownHidden.has(classNameOf(f))),
    ...annotationSets
      .filter((s) => s.id !== activeSetId)
      .flatMap((set) => {
        const peerHidden = new Set(annotationView[set.id]?.hiddenClasses ?? []);
        return set.features.filter((f) => isSelected(f) && !peerHidden.has(classNameOf(f)));
      }),
  ];

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
              getLineWidth: (f) =>
                (f as AnnotationFeature).geometry?.type === "Point" ? 1.5 : ring.width,
              lineWidthUnits: "pixels",
              lineWidthMinPixels: 1,
              pointType: "circle",
              getPointRadius: ring.radius,
              pointRadiusUnits: "pixels",
              pointRadiusMinPixels: ring.radius,
            }),
        );

  void activeClassification;
  // Selection frame beneath the color layers so the classification color line stays on top.
  return [...highlightLayers, ...peerLayers, ownLayer];
};
