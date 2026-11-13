import type { AnnotationFeature, AnnotationSet } from "~/utils/db/getAnnotationsWasm";

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
 * Rectangle regions across every annotation set, identified by annotation
 * name. Exporting a region needs no write access, so peer sets count too —
 * the set's author only gates editing, never reading.
 */
export const rectangleRegions = (
  annotationSets: AnnotationSet[],
): { id: string; name: string; feature: AnnotationFeature; setId: string }[] => {
  const regions: { id: string; name: string; feature: AnnotationFeature; setId: string }[] = [];
  for (const set of annotationSets) {
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
