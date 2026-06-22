import type { Feature, Geometry } from "geojson";

import { createDatabase } from "./createDatabase";
import { resolveResourceId } from "../connectionsStore/selectors";
import { getSidecarKey } from "../sidecarKey";

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

// Existence check via S3 ListObjects (we grant ListBucket) — a missing sidecar
// returns 0 rows instead of throwing, so absence is data, not an exception we'd
// have to recognize by parsing duckdb error strings. Both the own-file key and
// the multi-user glob are valid `glob()` patterns.
export const sidecarFilesQuery = /*sql*/ `SELECT file FROM glob(?)`;

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
 *
 * Absence is resolved by an explicit `glob()` (→ 0 rows), never by catching the
 * read's error — so connectivity/permission/server errors propagate instead of
 * being mistaken for "no annotations" (which would let an empty seed clobber the
 * real sidecar on the next autosave).
 */
export async function getAnnotationsWasm(
  resourceId: string,
  userId?: string,
): Promise<AnnotationFeature[]> {
  const { credentials, connectionConfig, s3Uri } = resolveResourceId(resourceId);
  const target = getSidecarKey(s3Uri, "annotations", userId);

  const connection = await createDatabase(resourceId, credentials, connectionConfig);

  const globStatement = await connection.prepare(sidecarFilesQuery);
  let hasSidecar: boolean;
  try {
    hasSidecar = (await globStatement.query(target)).numRows > 0;
  } finally {
    await globStatement.close();
  }
  if (!hasSidecar) return [];

  const statement = await connection.prepare(annotationsQuery);
  try {
    const table = await statement.query(target);
    const features: AnnotationFeature[] = [];
    for (const row of table.toArray()) {
      const raw = (row as { feature?: string }).feature;
      if (raw) features.push(JSON.parse(raw) as AnnotationFeature);
    }
    return features;
  } finally {
    await statement.close();
  }
}
