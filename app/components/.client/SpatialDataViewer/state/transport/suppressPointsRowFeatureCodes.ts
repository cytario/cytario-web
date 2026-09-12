import type { PointsElement, SpatialData } from "@spatialdata/core";

const featurelessClone = (element: PointsElement): PointsElement => {
  const clone = Object.create(
    Object.getPrototypeOf(element),
    Object.getOwnPropertyDescriptors(element),
  );
  clone.loadRowFeatureCodes = async () => undefined;
  return clone;
};

/**
 * Present points elements as featureless when seeding the viewer store.
 *
 * The viewer's layer engine plans a row-feature-codes task for every points
 * element by default, which reads the feature column of the whole parquet in
 * a second full pass. This viewer has no feature colour or selection UI, so the
 * codes are dead weight: with the override the task settles immediately and
 * the geometry preload (loadPoints) is untouched.
 */
export function suppressPointsRowFeatureCodes(spatialData: SpatialData): SpatialData {
  const { points } = spatialData;
  if (!points) return spatialData;

  const featureless: Record<string, PointsElement> = {};
  for (const [key, element] of Object.entries(points)) {
    featureless[key] = featurelessClone(element);
  }

  // Descriptor clone rather than spread: the SpatialData class carries
  // prototype methods (coordinateSystems, getAssociatedTables) the viewer uses.
  const descriptors = Object.getOwnPropertyDescriptors(spatialData);
  descriptors.points = { ...descriptors.points, value: featureless };
  return Object.create(Object.getPrototypeOf(spatialData), descriptors) as SpatialData;
}
