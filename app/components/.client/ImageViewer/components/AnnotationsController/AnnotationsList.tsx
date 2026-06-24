import { IconButton, Menu, MenuItem, MenuSeparator } from "@cytario/design";
import type { Geometry } from "geojson";
import { useMemo } from "react";

import { AnnotationGroupRow } from "./AnnotationGroupRow";
import { flyToFeatureViewState } from "./flyToFeature";
import { classNameOf } from "../../state/store/slices/viewer.annotations.store";
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

const GeometryThumb = ({ geometry, color }: { geometry: Geometry; color?: string }) => {
  if (geometry.type === "Point") {
    return (
      <svg width={THUMB_SIZE} height={THUMB_SIZE} className="inline-block rounded bg-muted">
        <circle
          cx={THUMB_SIZE / 2}
          cy={THUMB_SIZE / 2}
          r={3}
          fill={color ?? "currentColor"}
          className={color ? undefined : "fill-secondary"}
        />
      </svg>
    );
  }
  return <GeometrySvg rings={geometryToRings(geometry)} size={THUMB_SIZE} color={color} />;
};

interface AnnotationGroup {
  name: string;
  color: RGB | null;
  items: { feature: AnnotationFeature; index: number }[];
}

/** Groups the annotation features by classification (with an `Unclassified`
 *  fallback). Each group can be shown/hidden and recolored; clicking a feature
 *  preview selects it and flies the viewport to it. */
export const AnnotationsList = () => {
  const features = useViewerStore((s) => s.annotationFeatures);
  const selectedIds = useViewerStore((s) => s.annotationSelectedIds);
  const setSelectedIds = useViewerStore((s) => s.setAnnotationSelectedIds);
  const setFeatures = useViewerStore((s) => s.setAnnotationFeatures);
  const hiddenClasses = useViewerStore((s) => s.annotationHiddenClasses);
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
    setFeatures(features.filter((f) => f !== feature));
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
        const cssColor = group.color ? rgb([...group.color, 255]) : undefined;
        return (
          <div key={group.name} className="flex flex-col">
            <AnnotationGroupRow
              name={group.name}
              count={group.items.length}
              color={group.color}
              isVisible={!hiddenClasses.includes(group.name)}
              onToggleVisibility={() => toggleClassVisibility(group.name)}
              onColorChange={group.color ? (color) => setClassColor(group.name, color) : undefined}
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
                      className={`rounded border text-muted-foreground hover:text-foreground ${
                        isSelected ? "border-primary text-foreground" : "border-border"
                      }`}
                    >
                      <GeometryThumb geometry={feature.geometry} color={cssColor} />
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
                              onAction={() => deleteFeature(feature)}
                            >
                              Delete annotation
                            </MenuItem>
                          </>
                        }
                      >
                        <IconButton
                          icon="EllipsisVertical"
                          aria-label="Annotation actions"
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
