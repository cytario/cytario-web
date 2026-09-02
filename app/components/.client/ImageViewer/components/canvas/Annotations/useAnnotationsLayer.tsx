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
import { select } from "../../../state/store/selectors";
import {
  annotationNameOf,
  classColor as registeredClassColor,
  classNameOf,
  isReservedClassName,
  selectActiveSetFeatures,
  UNCLASSIFIED,
  UNCLASSIFIED_COLOR,
} from "../../../state/store/slices/viewer.annotations.store";
import {
  type CytarioLayerResult,
  type LayerTooltipItem,
} from "../../../state/store/slices/viewer.view.store";
import { RGB, RGBA } from "../../../state/store/types";
import { useViewerStore } from "../../../state/store/ViewerStoreContext";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import {
  type AnnotationClassification,
  validAnnotationFeatures,
} from "~/utils/db/annotationSchema";
import { type AnnotationFeature } from "~/utils/db/getAnnotationsWasm";

/** Minimal structural shape of the modifier flags carried by the DOM event
 *  behind a deck picking event — all optional so any concrete DOM event
 *  (Mouse/Pointer/Touch) is assignable to the click handler. */
type ModifierKeys = { metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean };

const MODE_CLASSES = {
  view: ViewMode,
  inspect: ViewMode,
  "draw-polygon": DrawPolygonMode,
  "draw-freehand": DrawPolygonByDraggingMode,
  "draw-point": ClickOrDragPointMode,
} as const;

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

// Dual-contrast selection frame: white/black/white achromatic rings, widest
// drawn underneath. Achromatic (not a hue) so it never collides with a
// classification color, and the white↔black alternation stays legible on pure
// black, pure white, and arbitrary colored slide backgrounds. Drawn beneath the
// feature's own color line so the classification color stays on top, framed.
// `width` = polygon stroke (px); `radius` = concentric ring radius for points.
const SELECTION_RINGS: { width: number; radius: number; color: RGBA }[] = [
  { width: 9, radius: 9, color: [255, 255, 255, 255] },
  { width: 6, radius: 7.5, color: [0, 0, 0, 255] },
  { width: 3.5, radius: 6, color: [255, 255, 255, 255] },
];

const classColor = (feature: AnnotationFeature): RGB =>
  feature.properties?.classification?.color ?? UNCLASSIFIED_COLOR;

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
  active: AnnotationClassification | null,
): AnnotationFeature[] => {
  const now = new Date().toISOString();
  // Pre-collect existing names so every new feature in this edit gets a unique
  // auto-generated name (e.g. "0003" when 0001 and 0002 already exist).
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
      // A freshly drawn region inherits the active class (none → unclassified)
      // and an auto-generated unique name.
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

/**
 * Builds the `EditableGeoJsonLayer` for the image's annotations, rendering and
 * editing the shared working set held in the viewer store. Coordinates are
 * level-0 pixel space (CARTESIAN, matching the viewer's `OrthographicView`).
 * Edits flow back through `onEdit` → `ensureOwnSet()` + `updateSetFeatures(setId, …)`,
 * which the sync middleware diffs and autosaves to that set's sidecar.
 *
 * With `interactive: false` (preview/minimap decks) the own set renders as a
 * plain read-only `GeoJsonLayer` like the peers and picking is disabled
 * everywhere, so clicks pan the preview instead of drawing or selecting.
 */
export const useAnnotationsLayer = (
  imagePanelId: number,
  interactive = true,
): CytarioLayerResult<GeoJsonLayer | EditableGeoJsonLayer> => {
  const ownUserId = useCurrentUser()?.sub;
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

  // The active class resolved to a stampable classification. The registry is
  // the source of truth so a freshly created, still-empty class stamps too;
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

    // Props shared by the own (editable) and peer (read-only) layers: fill/line
    // colored by classification (hidden classes → alpha 0) and view-mode
    // click-to-select. Only the alphas and per-user hidden/opacity differ.
    const selectOnClick = (info: PickingInfo, event?: { srcEvent?: ModifierKeys }) => {
      if (mode !== "view") return; // in draw modes a click is a draw action
      const id = (info.object as AnnotationFeature | undefined)?.id;
      if (!id) return;
      const src = event?.srcEvent;
      // Any modifier keeps the selection additive — toggle the clicked feature in
      // or out. Range-select needs an ordered list, which the canvas has no
      // meaningful notion of, so Shift behaves like Cmd/Ctrl here.
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

    // Preview decks render the own set read-only, styled like the editable
    // layer but without edit modes or picking.
    const ownFill = Math.round(annotationsOpacity * 255);
    const ownLine = showOutline ? 255 : 0;
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
          mode: MODE_CLASSES[mode],
          selectedFeatureIndexes,
          ...paint(ownView?.hiddenClasses, ownFill, ownLine),

          onEdit: ({ updatedData, editType, editContext }) => {
            // Persist only committing edits — anything else (tentative draw events,
            // cancel/invalid) carries unchanged data; persisting it would rebuild
            // this layer mid-stroke and drop the active draw.
            if (!COMMITTING_EDITS.has(editType)) return;

            if (!ownUserId) return; // edits route to the current user's own key
            const changed: number[] | undefined = editContext?.featureIndexes;
            const stamped = stampEdit(
              updatedData.features as AnnotationFeature[],
              changed,
              activeClassification,
            );
            // Validate before persist: a degenerate/aborted draw (empty ring,
            // `[[null]]`) is dropped and never written to S3 — the store is valid by
            // construction.
            const valid = validAnnotationFeatures(stamped);
            const setId = ensureOwnSet();
            updateSetFeatures(setId, valid);
            if (editType === "addFeature") {
              // Select the new feature only if it survived validation.
              const newId = stamped[stamped.length - 1]?.id;
              if (newId && valid.some((f) => f.id === newId)) {
                setSelectedIds([newId]);
                // Never draw into a hidden class — reveal the class the region landed in.
                showAnnotationClass(setId, activeClassification?.name ?? UNCLASSIFIED);
              }
            }
          },
        });

    // Other users' sets: one layer each, read-only (selectable + hoverable, not
    // editable), dimmer than own, drawn beneath the editable layer. Hidden
    // classes fade to alpha 0, mirroring the editable layer.
    const peerLayers = annotationSets
      .filter((s) => s.id !== activeSetId)
      .map((set) => {
        const peerView = annotationView[set.id];
        return new GeoJsonLayer({
          id: `annotations-${imagePanelId}-peer-${set.id}`,
          data: { type: "FeatureCollection", features: set.features },
          // Peers are dimmer than own (2/3 fill, 200 stroke) but otherwise identical.
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

    // Concentric outline halo on the selected feature(s) — selection isn't
    // visibly rendered in view mode, so stack GeoJsonLayers (widest first) over
    // the editable layer. Selection is global across users, so the halo spans
    // own + peer sets; hidden features (per their own owner) are excluded so a
    // halo never reveals one.
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
                // Points get a thin stroke at increasing radii (concentric
                // circles); polygons get the full ring width centered on the path.
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

    // Selection frame beneath the color layers so the classification color line
    // stays on top and the achromatic frame reads around it; own above peers.
    const layers = [...highlightLayers, ...peerLayers, ownLayer];

    // --- Composite tooltip contributors ---

    // Build a lookup of hidden classes per user so `getTooltipItems` can
    // quickly check whether a picked feature is visually transparent (its
    // class is hidden → fill alpha 0). This is the core fix for C-427:
    // transparent annotations return `[]` so they no longer block tooltip
    // items from layers beneath them.
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
    ensureOwnSet,
    updateSetFeatures,
    setSelectedIds,
    showAnnotationClass,
    activeClassification,
    interactive,
  ]);
};
