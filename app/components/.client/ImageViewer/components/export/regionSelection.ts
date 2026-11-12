import type { ViewerStore } from "../../state/store/types";
import type { AnnotationFeature } from "~/utils/db/getAnnotationsWasm";

/** Rectangle-polygon check: a closed 5-position ring that is axis-aligned. */
const isRectanglePolygon = (feature: AnnotationFeature): boolean => {
  const geometry = feature.geometry;
  if (!geometry || geometry.type !== "Polygon") return false;
  const ring = geometry.coordinates[0];
  if (!ring || ring.length !== 5) return false;
  const [first, second, third, fourth, fifth] = ring;
  if (!first || !second || !third || !fourth || !fifth) return false;
  const closed = first[0] === fifth[0] && first[1] === fifth[1];
  const axisAligned =
    (first[0] === second[0] &&
      second[1] === third[1] &&
      third[0] === fourth[0] &&
      fourth[1] === first[1]) ||
    (first[1] === second[1] &&
      second[0] === third[0] &&
      third[1] === fourth[1] &&
      fourth[0] === first[0]);
  return closed && axisAligned;
};

/**
 * Rectangle regions of the user's own annotation sets, identified by annotation
 * name. Unowned sets (legacy imports with no cytario envelope) count as own —
 * they are editable by anyone, matching the layer's own-set treatment.
 */
export const rectangleRegionsOfOwnSets = (
  store: ViewerStore,
): { id: string; name: string; feature: AnnotationFeature; setId: string }[] => {
  const ownSets = store.annotationSets.filter(
    (set) => !set.createdBy || set.createdBy === store.currentUserId,
  );
  const regions: { id: string; name: string; feature: AnnotationFeature; setId: string }[] = [];
  for (const set of ownSets) {
    for (const feature of set.features) {
      if (!isRectanglePolygon(feature)) continue;
      regions.push({
        id: feature.id,
        name: feature.properties?.name ?? feature.id,
        feature,
        setId: set.id,
      });
    }
  }
  return regions;
};
