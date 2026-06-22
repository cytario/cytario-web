import type { AnnotationFeature } from "./getAnnotationsWasm";
import { SidecarRepository } from "./sidecarRepository";
import { resolveResourceId } from "../connectionsStore/selectors";

const SCHEMA_VERSION = "1.0";

/**
 * Writes a user's complete annotation set to their own sidecar
 * (`<image>.annotations.<userId>.json`). Each user owns one file (single-writer
 * per key), so this is a full-file overwrite. Builds the GeoJSON
 * `FeatureCollection` + `cytario` envelope here and hands it to the repository;
 * geometry is level-0 pixel coordinates, written verbatim.
 */
export async function writeAnnotations(
  resourceId: string,
  userId: string,
  features: AnnotationFeature[],
): Promise<void> {
  const { s3Uri } = resolveResourceId(resourceId);

  const document = {
    type: "FeatureCollection",
    cytario: {
      schemaVersion: SCHEMA_VERSION,
      kind: "annotations",
      image: s3Uri,
      series: 0,
      coordinateSpace: "pixel",
      pyramidLevel: 0,
      author: userId,
    },
    features,
  };

  await new SidecarRepository(resourceId, userId).write("annotations", document);
}
