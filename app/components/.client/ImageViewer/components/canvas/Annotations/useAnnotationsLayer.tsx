import type { PickingInfo } from "@deck.gl/core";
import { GeoJsonLayer } from "@deck.gl/layers";
import {
  DrawPolygonByDraggingMode,
  DrawPolygonMode,
  EditableGeoJsonLayer,
  ViewMode,
} from "@deck.gl-community/editable-layers";
import type { Feature, FeatureCollection } from "geojson";
import { useMemo } from "react";

import { ClickOrDragPointMode } from "./clickOrDragPointMode";
import {
  annotationNameOf,
  classColor as registeredClassColor,
  classNameOf,
  generateAnnotationName,
  isReservedClassName,
  selectActiveSetFeatures,
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

type ModifierKeys = { metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean };

const MODE_CLASSES = {
  view: ViewMode,
  inspect: ViewMode,
  "draw-polygon": DrawPolygonMode,
  "draw-freehand": DrawPolygonByDraggingMode,
  "draw-point": ClickOrDragPointMode,
} as const;

// Allowlist of edit types that change committed geometry — anything else
// (tentative draws, cancel/invalid) is ignored so the layer is never rebuilt mid-stroke.
const COMMITTING_EDITS = new Set([
  "addFeature",
  "addPosition",
  "removePosition",
  "movePosition",
  "finishMovePosition",
  "addHole",
  "unionGeometry",
]);

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
 *  bump for changed ones. Draw modes emit bare geometry, so identity is stamped here. */
const stampEdit = (
  features: AnnotationFeature[],
  changed: number[] | undefined,
  active: AnnotationClassification | null,
): AnnotationFeature[] => {
  const now = new Date().toISOString();
  // generateAnnotationName runs against the features named so far — pre-seeded
  // with every already-named feature, then extended as new names are minted.
  const named: AnnotationFeature[] = features.filter(
    (f) => typeof f.properties?.name === "string" && f.properties.name.length > 0,
  );
  return features.map((feature, i) => {
    const properties = feature.properties ?? {};
    if (!feature.id) {
      const stamped: AnnotationFeature = {
        ...feature,
        id: crypto.randomUUID(),
        properties: {
          ...properties,
          name: generateAnnotationName(named),
          ...(active ? { classification: active } : {}),
          createdAt: now,
          updatedAt: now,
        },
      };
      named.push(stamped);
      return stamped;
    }
    named.push(feature);
    if (changed?.includes(i)) {
      return { ...feature, properties: { ...properties, updatedAt: now } };
    }
    return feature;
  });
};

/** Builds the editable annotations layer over the shared working set in the viewer
 *  store. With `interactive: false` (preview/minimap decks) the own set renders
 *  read-only and picking is disabled so clicks pan the preview. */
export const useAnnotationsLayer = (
  imagePanelId: number,
  interactive = true,
): CytarioLayerResult<GeoJsonLayer | EditableGeoJsonLayer> => {
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
  const selectedIds = useViewerStore((s) => s.annotationSelectedIds);
  const ensureOwnSet = useViewerStore((s) => s.ensureOwnSet);
  const updateSetFeatures = useViewerStore((s) => s.updateSetFeatures);
  const setSelectedIds = useViewerStore((s) => s.setAnnotationSelectedIds);
  const showAnnotationClass = useViewerStore((s) => s.showAnnotationClass);
  const activeClass = useViewerStore((s) => s.annotationActiveClass);
  const annotationClasses = useViewerStore((s) => s.annotationClasses);

  // The registry is the source of truth so a freshly created, still-empty class stamps too;
  // member features are only the fallback for unregistered legacy names.
  const activeClassification = useMemo<AnnotationClassification | null>(() => {
    if (!activeClass || isReservedClassName(activeClass)) return null;
    const color = registeredClassColor(annotationClasses, features, activeClass);
    return color ? { name: activeClass, color } : null;
  }, [activeClass, annotationClasses, features]);

  return useMemo(() => {
    const data: FeatureCollection = { type: "FeatureCollection", features };
    const ownView = activeSetId ? annotationView[activeSetId] : undefined;
    const ownHidden = new Set(ownView?.hiddenClasses ?? []);
    const isHidden = (f: AnnotationFeature) => ownHidden.has(classNameOf(f));

    // Resolve selected ids → array indexes only here, at the deck boundary.
    const selected = new Set(selectedIds);
    const isSelected = (f: AnnotationFeature) => !!f.id && selected.has(f.id);
    const selectedFeatureIndexes = features.reduce<number[]>((acc, f, i) => {
      if (isSelected(f)) acc.push(i);
      return acc;
    }, []);

    const selectOnClick = (info: PickingInfo, event?: { srcEvent?: ModifierKeys }) => {
      if (mode !== "view") return;
      const id = (info.object as AnnotationFeature | undefined)?.id;
      if (!id) return;
      const src = event?.srcEvent;
      // Range-select needs an ordered list the canvas has no notion of, so Shift
      // behaves like Cmd/Ctrl here.
      if (src && (src.metaKey || src.ctrlKey || src.shiftKey)) {
        setSelectedIds(
          selectedIds.includes(id) ? selectedIds.filter((s) => s !== id) : [...selectedIds, id],
        );
        return;
      }
      setSelectedIds([id]);
    };

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
        onClick: selectOnClick,
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
    const ownLayer =
      !interactive || !canAnnotate
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
            mode: MODE_CLASSES[mode],
            selectedFeatureIndexes,
            ...paint(ownView?.hiddenClasses, ownFill, ownLine),

            onEdit: ({ updatedData, editType, editContext }) => {
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
            },
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
    const selectedFeatures: AnnotationFeature[] = [
      ...features.filter((f) => isSelected(f) && !isHidden(f)),
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

    // Selection frame beneath the color layers so the classification color line stays on top.
    const layers = [...highlightLayers, ...peerLayers, ownLayer];

    // Per-user hidden-class lookup so `getTooltipItems` can skip features that are
    // visually transparent (hidden class → alpha 0) and not block layers beneath them.
    const hiddenByUser = new Map<string, Set<string>>();
    if (activeSetId) hiddenByUser.set(activeSetId, new Set(ownView?.hiddenClasses ?? []));
    for (const set of annotationSets) {
      if (set.id !== activeSetId) {
        hiddenByUser.set(set.id, new Set(annotationView[set.id]?.hiddenClasses ?? []));
      }
    }

    const isHiddenFeature = (f: AnnotationFeature): boolean => {
      const cls = classNameOf(f);
      for (const hidden of hiddenByUser.values()) {
        if (hidden.has(cls)) return true;
      }
      return false;
    };

    const getTooltipItems = (info: PickingInfo): LayerTooltipItem[] => {
      const f = info.object as AnnotationFeature | undefined;
      if (!f) return [];
      if (isHiddenFeature(f)) return [];
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
