import type { Feature, Geometry } from "geojson";

import { createDatabase } from "./createDatabase";
import { resolveResourceId } from "../connectionsStore/selectors";
import { getSidecarGlob, getSidecarKey } from "../sidecarKey";

export interface AnnotationClassification {
  name: string;
  color: [number, number, number];
}

export interface AnnotationProperties {
  id?: string;
  name?: string;
  classification?: AnnotationClassification;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export type AnnotationFeature = Feature<Geometry, AnnotationProperties>;

// A glob matching no objects, or a single sidecar that doesn't exist yet (404),
// just means "no annotations" — not a failure. (GetObject is granted, so a 404
// on read is genuine absence, not a permission denial.)
function isNoFilesError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /no files found|matched no files|IO Error.*glob|404|no such (file|key)|unable to connect/i.test(
    message,
  );
}

export const annotationsQuery = /*sql*/ `
  SELECT unnest(json_extract(content::JSON, '$.features[*]'))::VARCHAR AS feature
  FROM read_text(?)
`;

/**
 * Reads annotation features (level-0 pixel coordinates) for an image. With a
 * `userId`, reads only that user's own sidecar — the editable/savable set
 * (single-writer, no cross-user contamination). Without, globs every user's
 * sidecar into a read-only union (display / reports). Returns `[]` when the
 * image is not a known image type or has no annotations yet.
 */
export async function getAnnotationsWasm(
  resourceId: string,
  userId?: string,
): Promise<AnnotationFeature[]> {
  const { credentials, connectionConfig, s3Uri } = resolveResourceId(resourceId);
  const target = userId
    ? getSidecarKey(s3Uri, { kind: "annotations", userId })
    : getSidecarGlob(s3Uri, { kind: "annotations" });
  if (!target) return [];

  const connection = await createDatabase(resourceId, credentials, connectionConfig);
  const statement = await connection.prepare(annotationsQuery);

  try {
    const table = await statement.query(target);
    const features: AnnotationFeature[] = [];
    for (const row of table.toArray()) {
      const raw = (row as { feature?: string }).feature;
      if (raw) features.push(JSON.parse(raw) as AnnotationFeature);
    }
    return features;
  } catch (error) {
    if (isNoFilesError(error)) return [];
    throw error;
  } finally {
    await statement.close();
  }
}
