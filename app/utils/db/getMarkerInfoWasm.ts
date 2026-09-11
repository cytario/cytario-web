import { createDatabase, releaseDatabase } from "./createDatabase";
import { escapeSqlIdentifier } from "./escapeSqlIdentifier";
import { type OverlayClassConfig, type OverlayConfig } from "./overlayConfig";
import { resolveResourceId } from "../connectionsStore/selectors";
import { MarkerInfo } from "~/components/.client/ImageViewer/components/sidebar/OverlaysSection/getOverlayState";

/** Total cell/object count (row count) of an overlay parquet. */
export async function getOverlayCellCount(resourceId: string): Promise<number> {
  const { credentials, region, endpoint, s3Uri } = resolveResourceId(resourceId);
  const connection = await createDatabase(resourceId, credentials, { region, endpoint });
  try {
    const result = await connection.query(/*sql*/ `
      SELECT count(*)::BIGINT AS n FROM read_parquet('${s3Uri}')
    `);
    const row = result.toArray()[0] as { n: bigint } | undefined;
    return Number(row?.n ?? 0);
  } finally {
    releaseDatabase(resourceId);
  }
}

function classCountExpression(cls: OverlayClassConfig): string {
  const source = escapeSqlIdentifier(cls.sourceColumn);
  if (cls.mode === "threshold") {
    // NULL comparisons are false, so NULL-heavy columns count as 0, not NULL.
    return `SUM(CAST((${source} ${cls.operator} ${cls.threshold}) AS INTEGER))`;
  }
  return `SUM(CAST(CAST(${source} AS BOOLEAN) AS INTEGER))`;
}

function buildMarkerCountsQuery(s3Uri: string, config: OverlayConfig | null): string {
  if (!config || config.classes.length === 0) {
    return /*sql*/ `
      SELECT SUM(COLUMNS('marker_positive_.*'))
      FROM read_parquet('${s3Uri}')
    `;
  }
  const projections = config.classes
    .slice(0, 32)
    .map((cls) => `${classCountExpression(cls)} AS ${escapeSqlIdentifier(cls.sourceColumn)}`);
  return /*sql*/ `
    SELECT ${projections.join(",\n")}
    FROM read_parquet('${s3Uri}')
  `;
}

/**
 * Extract marker information from DuckDB-WASM database. Without a config this
 * keeps the legacy marker_positive_ regex behavior; with one, counts derive
 * from the configured class columns.
 */
export async function getMarkerInfoWasm(
  resourceId: string,
  config?: OverlayConfig | null,
): Promise<MarkerInfo> {
  const { credentials, region, endpoint, s3Uri } = resolveResourceId(resourceId);
  const connection = await createDatabase(resourceId, credentials, { region, endpoint });

  try {
    const countResult = await connection.query(buildMarkerCountsQuery(s3Uri, config ?? null));

    const row = countResult.toArray()[0] as Record<string, bigint>;
    const markerInfo: Record<string, { count: number }> = {};

    for (const [column, value] of Object.entries(row)) {
      markerInfo[column] = { count: Number(value || 0) };
    }

    return markerInfo;
  } catch (error) {
    console.error(`Error extracting marker info:`, error);
    throw error;
  } finally {
    releaseDatabase(resourceId);
  }
}
