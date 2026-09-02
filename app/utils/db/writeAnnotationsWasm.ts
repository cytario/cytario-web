import type { AnnotationFeature } from "./getAnnotationsWasm";
import { SidecarRepository } from "./sidecarRepository";
import { resolveResourceId } from "../connectionsStore/selectors";

const SCHEMA_VERSION = "1.0";

/**
 * Writes a complete annotation set to its own sidecar
 * (`<image>.annotations.<setId>.json`). Each set owns one file (single-writer
 * per key), so this is a full-file overwrite. `setId` is the key segment
 * (UUID for new sets); `createdBy` is the user id written into
 * `cytario.createdBy` (set-level) and stamped onto each feature's
 * `properties.createdBy` (feature-level provenance that survives merges/copies).
 * `name` is the set's display name, written into `cytario.name` when defined.
 * Geometry is level-0 pixel coordinates, written verbatim.
 */
export async function writeAnnotations(
  resourceId: string,
  setId: string,
  createdBy: string | undefined,
  features: AnnotationFeature[],
  name: string | undefined = undefined,
): Promise<void> {
  const { s3Uri } = resolveResourceId(resourceId);

  const stamped = features.map((f) => ({
    ...f,
    properties: { ...f.properties, ...(createdBy ? { createdBy } : {}) },
  }));

  const document = {
    type: "FeatureCollection",
    cytario: {
      schemaVersion: SCHEMA_VERSION,
      kind: "annotations",
      image: s3Uri,
      series: 0,
      coordinateSpace: "pixel",
      pyramidLevel: 0,
      ...(createdBy ? { createdBy } : {}),
      ...(name ? { name } : {}),
    },
    features: stamped,
  };

  await new SidecarRepository(resourceId, setId).write("annotations", document);
}
