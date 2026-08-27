import { createDatabase } from "../../utils/db/createDatabase";
import { resolveResourceId } from "~/utils/connectionsStore/selectors";
import { getFileType } from "~/utils/fileType";

/**
 * Fetch rows from a data file on S3.
 * Supports: parquet, csv
 */
export async function getParquetRows(
  resourceId: string,
  limit = 100,
  offset = 0,
): Promise<Record<string, unknown>[]> {
  const { credentials, region, endpoint, s3Uri } = resolveResourceId(resourceId);
  const connection = await createDatabase(resourceId, credentials, { region, endpoint });
  const isCsv = getFileType(resourceId) === "CSV";
  const readFn = isCsv ? `read_csv_auto('${s3Uri}', comment = '#')` : `read_parquet('${s3Uri}')`;

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
