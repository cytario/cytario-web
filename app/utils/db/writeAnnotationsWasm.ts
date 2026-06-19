import { createDatabase } from "./createDatabase";
import { escapeSqlString } from "./escapeSqlString";
import type { AnnotationFeature } from "./getAnnotationsWasm";
import { resolveResourceId } from "../connectionsStore/selectors";
import { getSidecarKey } from "../sidecarKey";

const SCHEMA_VERSION = "1.0";

/**
 * Writes a user's complete annotation set to their own sidecar
 * (`<image>.annotations.<userId>.json`) via duckdb `COPY TO`. Each user owns one
 * file (single-writer per key), so this is a full-file overwrite — callers pass
 * the resulting set after read-modify-write. Geometry is level-0 pixel
 * coordinates, written verbatim.
 *
 * `COPY … (FORMAT JSON)` emits one JSON object per row; the single row's
 * `type` / `cytario` / `features` columns serialize to one bare
 * FeatureCollection. Features originate in the browser, so they're inlined as
 * JSON literals; the `COPY TO` target can't be a bound parameter, so the s3 key
 * and interpolated values are escaped.
 */
export async function writeAnnotations(
  resourceId: string,
  userId: string,
  features: AnnotationFeature[],
): Promise<void> {
  const { credentials, connectionConfig, s3Uri } = resolveResourceId(resourceId);
  const key = getSidecarKey(s3Uri, { kind: "annotations", userId });
  if (!key) throw new Error(`Not an image resource: ${resourceId}`);

  const connection = await createDatabase(resourceId, credentials, connectionConfig);

  const dest = escapeSqlString(key);
  const image = escapeSqlString(s3Uri);
  const author = escapeSqlString(userId);

  const featuresSql = features.length
    ? `[${features.map((f) => `'${escapeSqlString(JSON.stringify(f))}'::JSON`).join(", ")}]`
    : "CAST([] AS JSON[])";

  await connection.query(`
    COPY (
      SELECT
        'FeatureCollection' AS type,
        json_object(
          'schemaVersion', '${SCHEMA_VERSION}',
          'kind', 'annotations',
          'image', '${image}',
          'series', 0,
          'coordinateSpace', 'pixel',
          'pyramidLevel', 0,
          'author', '${author}'
        ) AS cytario,
        ${featuresSql} AS features
    ) TO '${dest}' (FORMAT JSON);
  `);
}
