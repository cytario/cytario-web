import { IconButton, Menu, MenuItem, MenuSeparator } from "@cytario/design";
import type { Geometry } from "geojson";
import { useMemo } from "react";

import { AnnotationGroupRow } from "./AnnotationGroupRow";
import { flyToFeatureViewState } from "./flyToFeature";
import {
  classNameOf,
  selectUserHiddenClasses,
  UNCLASSIFIED_COLOR,
} from "../../state/store/slices/viewer.annotations.store";
import { RGB } from "../../state/store/types";
import { useViewerStore } from "../../state/store/ViewerStoreContext";
import { rgb } from "../ChannelsController/ColorPicker/ColorPicker";
import { GeometrySvg, type Point } from "~/components/DataGrid/GeometrySvg";
import type { AnnotationFeature } from "~/utils/db/getAnnotationsWasm";

const THUMB_SIZE = 48;

/** GeoJSON polygon geometry → screen-space rings (annotation coords are already
 *  pixel space, Y-down — no flip). Points have no rings; the caller renders a
 *  glyph. Annotation draw modes only emit Polygon/Point. */
const geometryToRings = (geometry: Geometry): Point[][] => {
  if (geometry.type === "Polygon") {
    return geometry.coordinates.map((ring) => ring.map(([x, y]) => ({ x, y })));
  }
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.flatMap((polygon) =>
      polygon.map((ring) => ring.map(([x, y]) => ({ x, y }))),
    );
  }
  return [];
};

/** Concentric white/black/white rings around a selected point, mirroring the
 *  on-slide point selection frame. Radii outermost-first (drawn underneath). */
const POINT_SELECTION_RINGS = [
  { r: 6.5, stroke: "#fff" },
  { r: 5.5, stroke: "#000" },
  { r: 4.5, stroke: "#fff" },
];

const GeometryThumb = ({
  geometry,
  color,
  selected,
}: {
  geometry: Geometry;
  color?: string;
  selected?: boolean;
}) => {
  if (geometry.type === "Point") {
    const c = THUMB_SIZE / 2;
    return (
      <svg width={THUMB_SIZE} height={THUMB_SIZE} className="inline-block rounded bg-muted">
        {selected &&
          POINT_SELECTION_RINGS.map((ring) => (
            <circle
              key={ring.r}
              cx={c}
              cy={c}
              r={ring.r}
              fill="none"
              stroke={ring.stroke}
              strokeWidth={1.5}
            />
          ))}
        <circle
          cx={c}
          cy={c}
          r={3}
          fill={color ?? "currentColor"}
          className={color ? undefined : "fill-secondary"}
        />
      </svg>
    );
  }
  return (
    <GeometrySvg
      rings={geometryToRings(geometry)}
      size={THUMB_SIZE}
      color={color}
      selected={selected}
    />
  );
};

interface AnnotationGroup {
  name: string;
  color: RGB | null;
  items: { feature: AnnotationFeature; index: number }[];
}

interface AnnotationsListProps {
  /** Owner of this set; the key edits route to. */
  userId: string;
  features: AnnotationFeature[];
  /** Current user owns this set → drawing/recolor/delete enabled. Peers are
   *  read-only until role-based edit-others lands; for now the menu still shows
   *  on every geometry, only the destructive actions are disabled. */
  editable: boolean;
}

/** Groups one user's annotation features by classification (with an
 *  `Unclassified` fallback). Each group can be shown/hidden and (when editable)
 *  recolored; a thumbnail click selects + flies to the feature. */
export const AnnotationsList = ({ userId, features, editable }: AnnotationsListProps) => {
  const selectedIds = useViewerStore((s) => s.annotationSelectedIds);
  const setSelectedIds = useViewerStore((s) => s.setAnnotationSelectedIds);
  const updateUserFeatures = useViewerStore((s) => s.updateUserFeatures);
  const hiddenClasses = useViewerStore(selectUserHiddenClasses(userId));
  const toggleClassVisibility = useViewerStore((s) => s.toggleAnnotationClassVisibility);
  const setClassColor = useViewerStore((s) => s.setAnnotationClassColor);
  const viewState = useViewerStore((s) => s.viewStateActive);
  const setViewState = useViewerStore((s) => s.setViewStateActive);

  const select = (feature: AnnotationFeature) => {
    setSelectedIds(feature.properties?.id ? [feature.properties.id] : []);
  };

  const zoomToFeature = (feature: AnnotationFeature) => {
    select(feature);
    if (!viewState) return;
    const next = flyToFeatureViewState(feature.geometry, viewState);
    if (next) setViewState(next);
  };

  const deleteFeature = (feature: AnnotationFeature) => {
    setSelectedIds([]);
    updateUserFeatures(
      userId,
      features.filter((f) => f !== feature),
    );
  };

  const groups = useMemo<AnnotationGroup[]>(() => {
    const byName = new Map<string, AnnotationGroup>();
    features.forEach((feature, index) => {
      const name = classNameOf(feature);
      let group = byName.get(name);
      if (!group) {
        group = { name, color: feature.properties?.classification?.color ?? null, items: [] };
        byName.set(name, group);
      }
      group.items.push({ feature, index });
    });
    return [...byName.values()];
  }, [features]);

  return (
    <div className="flex flex-col gap-2 px-3 py-2">
      {groups.map((group) => {
        const cssColor = rgb([...(group.color ?? UNCLASSIFIED_COLOR), 255]);
        return (
          <div key={group.name} className="flex flex-col">
            <AnnotationGroupRow
              name={group.name}
              count={group.items.length}
              color={group.color}
              isVisible={!hiddenClasses.includes(group.name)}
              onToggleVisibility={() => toggleClassVisibility(userId, group.name)}
              onColorChange={
                editable && group.color
                  ? (color) => setClassColor(userId, group.name, color)
                  : undefined
              }
            />

            <div className="flex flex-wrap gap-1.5 pt-1">
              {group.items.map(({ feature, index }) => {
                const id = feature.properties?.id;
                const isSelected = !!id && selectedIds.includes(id);
                return (
                  <div key={id ?? index} className="group/thumb relative">
                    <button
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => select(feature)}
                      className="rounded border border-border text-muted-foreground hover:text-foreground"
                    >
                      <GeometryThumb
                        geometry={feature.geometry}
                        color={cssColor}
                        selected={isSelected}
                      />
                    </button>

                    <div className="absolute right-0 top-0 rounded bg-background/80 opacity-0 transition-opacity group-hover/thumb:opacity-100 focus-within:opacity-100">
                      <Menu
                        content={
                          <>
                            <MenuItem
                              id="zoom"
                              icon="ZoomIn"
                              onAction={() => zoomToFeature(feature)}
                            >
                              Zoom to annotation
                            </MenuItem>
                            <MenuSeparator />
                            <MenuItem
                              id="delete"
                              icon="Trash2"
                              isDanger
                              isDisabled={!editable}
                              onAction={() => deleteFeature(feature)}
                            >
                              Delete annotation
                            </MenuItem>
                          </>
                        }
                      >
                        <IconButton
                          icon="EllipsisVertical"
                          label="Annotation actions"
                          variant="ghost"
                          size="xs"
                        />
                      </Menu>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};
