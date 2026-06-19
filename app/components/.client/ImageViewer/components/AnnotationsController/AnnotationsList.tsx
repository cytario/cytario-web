import type { Geometry } from "geojson";
import { useMemo } from "react";

import { flyToFeatureViewState } from "./flyToFeature";
import { useViewerStore } from "../../state/store/ViewerStoreContext";
import { GeometrySvg, type Point } from "~/components/DataGrid/GeometrySvg";
import type { AnnotationFeature } from "~/utils/db/getAnnotationsWasm";

const UNCLASSIFIED = "Unclassified";
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
  color: string | null;
  items: { feature: AnnotationFeature; index: number }[];
}

const swatchColor = (rgb?: [number, number, number]): string | null =>
  rgb ? `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})` : null;

/** Groups the annotation features by classification name (with an
 *  `Unclassified` fallback) and lists them; clicking a row selects it. */
export const AnnotationsList = () => {
  const features = useViewerStore((s) => s.annotationFeatures);
  const selectedIndexes = useViewerStore((s) => s.annotationSelectedIndexes);
  const setSelectedIndexes = useViewerStore((s) => s.setAnnotationSelectedIndexes);
  const viewState = useViewerStore((s) => s.viewStateActive);
  const setViewState = useViewerStore((s) => s.setViewStateActive);

  const selectAndFly = (index: number, feature: AnnotationFeature) => {
    setSelectedIndexes([index]);
    if (!viewState) return;
    const next = flyToFeatureViewState(feature.geometry, viewState);
    if (next) setViewState(next);
  };

  const groups = useMemo<AnnotationGroup[]>(() => {
    const byName = new Map<string, AnnotationGroup>();
    features.forEach((feature, index) => {
      const classification = feature.properties?.classification;
      const name = classification?.name ?? UNCLASSIFIED;
      let group = byName.get(name);
      if (!group) {
        group = { name, color: swatchColor(classification?.color), items: [] };
        byName.set(name, group);
      }
      group.items.push({ feature, index });
    });
    return [...byName.values()];
  }, [features]);

  return (
    <div className="flex flex-col gap-2 px-3 py-2">
      {groups.map((group) => (
        <div key={group.name} className="flex flex-col">
          <div className="flex items-center gap-1.5 py-1 text-xs font-medium text-foreground">
            <span
              className="size-3 shrink-0 rounded-sm border border-border"
              style={group.color ? { backgroundColor: group.color } : undefined}
              aria-hidden
            />
            <span className="truncate">{group.name}</span>
            <span className="text-muted-foreground">{group.items.length}</span>
          </div>

          <div className="flex flex-wrap gap-1.5 pt-1">
            {group.items.map(({ feature, index }) => {
              const isSelected = selectedIndexes.includes(index);
              return (
                <button
                  key={feature.properties?.id ?? index}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => selectAndFly(index, feature)}
                  className={`rounded border text-muted-foreground hover:text-foreground ${
                    isSelected ? "border-primary text-foreground" : "border-border"
                  }`}
                >
                  <GeometryThumb geometry={feature.geometry} color={group.color ?? undefined} />
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};
