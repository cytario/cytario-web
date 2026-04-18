import { getFileType, getReadFunction } from "./fileReader";
import { createDatabase } from "../../utils/db/createDatabase";
import { resolveResourceId } from "~/utils/connectionsStore";

export interface ParquetColumn {
  name: string;
  type: string;
}

/**
 * Fetch the schema (column names and types) from a data file on S3.
 * Supports: parquet, csv, json
 */
export async function getParquetSchema(
  resourceId: string,
): Promise<ParquetColumn[]> {
  const { credentials, connectionConfig, s3Uri } = resolveResourceId(resourceId);
  const connection = await createDatabase(resourceId, credentials, connectionConfig);
  const fileType = getFileType(resourceId);

  let result;

  if (fileType === "parquet") {
    result = await connection.query(/*sql*/ `
      SELECT name, type
      FROM parquet_schema('${s3Uri}')
      WHERE type IS NOT NULL
    `);
  } else {
    const readFn = getReadFunction(fileType, s3Uri);
    result = await connection.query(/*sql*/ `
      DESCRIBE SELECT * FROM ${readFn}
    `);
  }

  const columns: ParquetColumn[] = [];
  for (let i = 0; i < result.numRows; i++) {
    const row = result.get(i);
    if (row) {
      const name = (row.name ?? row.column_name) as string;
      const type = (row.type ?? row.column_type) as string;
      columns.push({ name, type });
    }
  }

  return columns;
}
