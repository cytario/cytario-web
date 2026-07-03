import { H3 } from "@cytario/design";
import type { PickingInfo } from "@deck.gl/core";
import { GeoJsonLayer } from "@deck.gl/layers";
import {
  DrawPolygonByDraggingMode,
  DrawPolygonMode,
  EditableGeoJsonLayer,
  ViewMode,
} from "@deck.gl-community/editable-layers";
import type { Feature, FeatureCollection } from "geojson";
import { type ReactNode, useMemo } from "react";

import { ClickOrDragPointMode } from "./clickOrDragPointMode";
import {
  classNameOf,
  isReservedClassName,
  selectUserFeatures,
  UNCLASSIFIED,
  UNCLASSIFIED_COLOR,
} from "../../../state/store/slices/viewer.annotations.store";
import { RGB, RGBA } from "../../../state/store/types";
import { useViewerStore } from "../../../state/store/ViewerStoreContext";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import {
  type AnnotationClassification,
  validAnnotationFeatures,
} from "~/utils/db/annotationSchema";
import { type AnnotationFeature } from "~/utils/db/getAnnotationsWasm";

type SetTooltip = (tooltip: { content: ReactNode; x: number; y: number } | null) => void;

/** Minimal structural shape of the modifier flags carried by the DOM event
 *  behind a deck picking event — all optional so any concrete DOM event
 *  (Mouse/Pointer/Touch) is assignable to the click handler. */
type ModifierKeys = { metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean };

const MODE_CLASSES = {
  view: ViewMode,
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

/** Hover tooltip content, styled like the overlay feature tooltip: id headline,
 *  then a color swatch + classification name. */
const AnnotationTooltip = ({ feature }: { feature: AnnotationFeature }) => {
  const [r, g, b] = classColor(feature);
  return (
    <div className="flex flex-col gap-1">
      <header>
        <H3 className="text-lg font-normal">ID: {feature.id}</H3>
      </header>
      <div className="flex items-center gap-2">
        <div
          className="w-4 h-4 rounded-full"
          style={{ backgroundColor: `rgb(${r}, ${g}, ${b})` }}
        />
        {classNameOf(feature)}
      </div>
    </div>
  );
};

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
  return features.map((feature, i) => {
    const properties = feature.properties ?? {};
    if (!feature.id) {
      // A freshly drawn region inherits the active class (none → unclassified).
      return {
        ...feature,
        id: crypto.randomUUID(),
        properties: {
          ...properties,
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
 * Edits flow back through `onEdit` → `updateUserFeatures(ownUserId, …)`, which
 * the sync middleware diffs and autosaves to the user's own sidecar.
 */
export const useAnnotationsLayer = (imagePanelId: number, setTooltip?: SetTooltip) => {
  const ownUserId = useCurrentUser()?.sub;
  const features = useViewerStore(selectUserFeatures(ownUserId));
  const annotationsByUser = useViewerStore((s) => s.annotationsByUser);
  const annotationView = useViewerStore((s) => s.annotationView);
  const annotationsOpacity = useViewerStore((s) => s.annotationsOpacity);
  const mode = useViewerStore((s) => s.annotationMode);
  const selectedIds = useViewerStore((s) => s.annotationSelectedIds);
  const updateUserFeatures = useViewerStore((s) => s.updateUserFeatures);
  const setSelectedIds = useViewerStore((s) => s.setAnnotationSelectedIds);
  const showAnnotationClass = useViewerStore((s) => s.showAnnotationClass);
  const activeClass = useViewerStore((s) => s.annotationActiveClass);

  // The active class resolved to a stampable classification. Active is always an
  // existing own group (or none), so its color comes from the current set.
  const activeClassification = useMemo<AnnotationClassification | null>(() => {
    if (!activeClass || isReservedClassName(activeClass)) return null;
    const color = features.find((f) => f.properties?.classification?.name === activeClass)
      ?.properties?.classification?.color;
    return color ? { name: activeClass, color } : null;
  }, [activeClass, features]);

  return useMemo(() => {
    const data: FeatureCollection = { type: "FeatureCollection", features };
    const ownView = ownUserId ? annotationView[ownUserId] : undefined;
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

    const paint = (
      hiddenClasses: string[] | undefined,
      opacity: number,
      fillAlpha: number,
      lineAlpha: number,
    ) => {
      const hidden = new Set(hiddenClasses ?? []);
      const colorAt = (f: Feature, alpha: number): RGBA =>
        withAlpha(
          classColor(f as AnnotationFeature),
          hidden.has(classNameOf(f as AnnotationFeature)) ? 0 : alpha,
        );
      return {
        coordinateSystem: "cartesian" as const,
        pickable: true,
        opacity,
        onClick: selectOnClick,
        onHover: (info: PickingInfo) => {
          const f = info.object as AnnotationFeature | undefined;
          setTooltip?.(
            f ? { content: <AnnotationTooltip feature={f} />, x: info.x, y: info.y } : null,
          );
        },
        getFillColor: (f: Feature) => colorAt(f, fillAlpha),
        getLineColor: (f: Feature) => colorAt(f, lineAlpha),
        getLineWidth: 2,
        lineWidthMinPixels: 1,
        pointRadiusMinPixels: 4,
        updateTriggers: { getFillColor: hiddenClasses, getLineColor: hiddenClasses },
      };
    };

    const editableLayer = new EditableGeoJsonLayer({
      id: `annotations-${imagePanelId}`,
      data,
      mode: MODE_CLASSES[mode],
      selectedFeatureIndexes,
      ...paint(ownView?.hiddenClasses, annotationsOpacity, 60, 255),

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
        updateUserFeatures(ownUserId, valid);
        if (editType === "addFeature") {
          // Select the new feature only if it survived validation.
          const newId = stamped[stamped.length - 1]?.id;
          if (newId && valid.some((f) => f.id === newId)) {
            setSelectedIds([newId]);
            // Never draw into a hidden class — reveal the class the region landed in.
            showAnnotationClass(ownUserId, activeClassification?.name ?? UNCLASSIFIED);
          }
        }
      },
    });

    // Other users' sets: one layer each, read-only (selectable + hoverable, not
    // editable), dimmer than own, drawn beneath the editable layer. Hidden
    // classes fade to alpha 0, mirroring the editable layer.
    const peerLayers = Object.entries(annotationsByUser)
      .filter(([userId]) => userId !== ownUserId)
      .map(([userId, peerFeatures]) => {
        const peerView = annotationView[userId];
        return new GeoJsonLayer({
          id: `annotations-${imagePanelId}-peer-${userId}`,
          data: { type: "FeatureCollection", features: peerFeatures },
          // Peers are dimmer than own (40/200 vs 60/255) but otherwise identical.
          ...paint(peerView?.hiddenClasses, annotationsOpacity, 40, 200),
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
      ...Object.entries(annotationsByUser)
        .filter(([userId]) => userId !== ownUserId)
        .flatMap(([userId, peerFeatures]) => {
          const peerHidden = new Set(annotationView[userId]?.hiddenClasses ?? []);
          return peerFeatures.filter((f) => isSelected(f) && !peerHidden.has(classNameOf(f)));
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
    return [...highlightLayers, ...peerLayers, editableLayer];
  }, [
    features,
    annotationsByUser,
    annotationView,
    annotationsOpacity,
    mode,
    selectedIds,
    imagePanelId,
    ownUserId,
    updateUserFeatures,
    setSelectedIds,
    showAnnotationClass,
    setTooltip,
    activeClassification,
  ]);
};
