import { resolveResourceId } from "~/utils/connectionsStore/selectors";
import { createDatabase, releaseDatabase } from "~/utils/db/createDatabase";

const readTextQuery = /*sql*/ `SELECT content FROM read_text(?)`;

/** The DuckDB connection singleton already has the resourceId's S3 credentials applied. */
export async function readTextFile(resourceId: string): Promise<string> {
  const { credentials, region, endpoint, s3Uri } = resolveResourceId(resourceId);
  const connection = await createDatabase(resourceId, credentials, { region, endpoint });

  let statement: Awaited<ReturnType<typeof connection.prepare>> | undefined;
  try {
    statement = await connection.prepare(readTextQuery);
    const result = await statement.query(s3Uri);
    const rows = result.toArray() as { content: string }[];
    if (rows.length === 0) return "";
    return rows[0].content;
  } finally {
    await statement?.close();
    releaseDatabase(resourceId);
  }
}
