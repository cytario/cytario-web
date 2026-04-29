import { getFileType, getReadFunction } from "./fileReader";
import { createDatabase } from "../../utils/db/createDatabase";
import { resolveResourceId } from "~/utils/connectionsStore/selectors";

/**
 * Fetch rows from a data file on S3.
 * Supports: parquet, csv, json
 */
export async function getParquetRows(
  resourceId: string,
  limit = 100,
  offset = 0,
): Promise<Record<string, unknown>[]> {
  const { credentials, connectionConfig, s3Uri } = resolveResourceId(resourceId);
  const connection = await createDatabase(resourceId, credentials, connectionConfig);
  const fileType = getFileType(resourceId);
  const readFn = getReadFunction(fileType, s3Uri);

  const result = await connection.query(/*sql*/ `
    SELECT * FROM ${readFn}
    LIMIT ${limit} OFFSET ${offset}
  `);

  const rows: Record<string, unknown>[] = [];
  for (let i = 0; i < result.numRows; i++) {
    const row = result.get(i);
    if (row) {
      rows.push(row.toJSON());
    }
  }

  return rows;
}
