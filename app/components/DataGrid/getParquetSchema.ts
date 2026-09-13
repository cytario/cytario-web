import { createDatabase, releaseDatabase } from "../../utils/db/createDatabase";
import { resolveResourceId } from "~/utils/connectionsStore/selectors";
import { getFileType } from "~/utils/fileType";

export interface ParquetColumn {
  name: string;
  type: string;
}

/**
 * Fetch the top-level column list (names and types) from a data file on S3.
 * Supports: parquet, csv
 */
export async function getParquetSchema(resourceId: string): Promise<ParquetColumn[]> {
  const { credentials, region, endpoint, s3Uri } = resolveResourceId(resourceId);
  const connection = await createDatabase(resourceId, credentials, { region, endpoint });
  const fileType = getFileType(resourceId);

  let result;

  try {
    if (fileType === "CSV") {
      result = await connection.query(/*sql*/ `
        DESCRIBE SELECT * FROM read_csv_auto('${s3Uri}', comment = '#')
      `);
    } else if (fileType === "Parquet") {
      result = await connection.query(/*sql*/ `
        SELECT name, type
        FROM parquet_schema('${s3Uri}')
        WHERE type IS NOT NULL
      `);
    } else {
      throw new Error(`Unsupported file type for schema extraction: ${fileType}`);
    }
  } finally {
    releaseDatabase(resourceId);
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

/**
 * Top-level parquet columns with struct columns intact — `DESCRIBE` keeps a
 * STRUCT column as one row (`bbox STRUCT(xmin …)`), while `parquet_schema`
 * flattens struct leaves into bare rows whose true access path only exists at
 * query time. Overlay interpretation needs the struct shape to address a
 * GeoParquet covering as `bbox.xmin`.
 */
export async function getParquetTopLevelSchema(resourceId: string): Promise<ParquetColumn[]> {
  const { credentials, region, endpoint, s3Uri } = resolveResourceId(resourceId);
  const connection = await createDatabase(resourceId, credentials, { region, endpoint });
  const fileType = getFileType(resourceId);
  if (fileType !== "Parquet") {
    throw new Error(`Unsupported file type for schema extraction: ${fileType}`);
  }

  try {
    const result = await connection.query(/*sql*/ `
      DESCRIBE SELECT * FROM read_parquet('${s3Uri}')
    `);
    const columns: ParquetColumn[] = [];
    for (let i = 0; i < result.numRows; i++) {
      const row = result.get(i);
      if (row) {
        columns.push({
          name: row.column_name as string,
          type: row.column_type as string,
        });
      }
    }
    return columns;
  } finally {
    releaseDatabase(resourceId);
  }
}
