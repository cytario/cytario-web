import type { Feature, Geometry } from "geojson";

import { createDatabase } from "./createDatabase";
import { resolveResourceId } from "../connectionsStore/selectors";
import { getSidecarGlob } from "../sidecarKey";

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

// duckdb raises an IO error when a glob matches no objects — for annotations
// that just means the image has none yet, not a failure.
function isNoFilesError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /no files found|matched no files|IO Error.*glob/i.test(message);
}

export const annotationsQuery = /*sql*/ `
  SELECT unnest(json_extract(content::JSON, '$.features[*]'))::VARCHAR AS feature
  FROM read_text(?)
`;

/**
 * Reads and unions all users' annotation sidecars for an image into a flat list
 * of GeoJSON Features (level-0 pixel coordinates). Returns `[]` when the image
 * is not a known image type or has no annotations yet.
 */
export async function getAnnotationsWasm(resourceId: string): Promise<AnnotationFeature[]> {
  const { credentials, connectionConfig, s3Uri } = resolveResourceId(resourceId);
  const glob = getSidecarGlob(s3Uri, { kind: "annotations" });
  if (!glob) return [];

  const connection = await createDatabase(resourceId, credentials, connectionConfig);
  const statement = await connection.prepare(annotationsQuery);

  try {
    const table = await statement.query(glob);
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
