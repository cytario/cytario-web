import { createDatabase } from "./createDatabase";
import { escapeSqlString } from "./escapeSqlString";
import {
  viewSettingsDocumentSchema,
  type ViewSettingsDocument,
  VIEW_SETTINGS_SCHEMA_VERSION,
} from "./viewSettingsSchema";
import { layersStateToSidecarEntry } from "./viewSettingsSchema";
import { resolveResourceId } from "../connectionsStore/selectors";
import { getViewSettingsKey } from "../sidecarKey";
import type { LayersStateEntry } from "~/components/.client/ImageViewer/state/store/types";

const readTextQuery = /*sql*/ `SELECT content FROM read_text(?)`;

export async function readViewSettings(resourceId: string): Promise<ViewSettingsDocument | null> {
  const { credentials, region, endpoint, s3Uri } = resolveResourceId(resourceId);
  const connection = await createDatabase(resourceId, credentials, { region, endpoint });
  const key = getViewSettingsKey(s3Uri);

  const globStatement = await connection.prepare("SELECT file FROM glob(?)");
  try {
    if ((await globStatement.query(key)).numRows === 0) return null;
  } finally {
    await globStatement.close();
  }

  const statement = await connection.prepare(readTextQuery);
  try {
    const rows = (await statement.query(key)).toArray() as { content: string }[];
    if (rows.length === 0 || !rows[0].content) return null;
    try {
      const parsed = JSON.parse(rows[0].content);
      return viewSettingsDocumentSchema.parse(parsed);
    } catch (error) {
      console.error("[viewSettings] skipping unparseable file:", error);
      return null;
    }
  } finally {
    await statement.close();
  }
}

export async function writeViewSettings(
  resourceId: string,
  layersStates: LayersStateEntry[],
): Promise<void> {
  const { credentials, region, endpoint, s3Uri } = resolveResourceId(resourceId);
  const connection = await createDatabase(resourceId, credentials, { region, endpoint });
  const key = getViewSettingsKey(s3Uri);
  const dest = escapeSqlString(key);

  const document: ViewSettingsDocument = {
    cytario: {
      schemaVersion: VIEW_SETTINGS_SCHEMA_VERSION,
      kind: "settings",
      image: s3Uri,
    },
    views: layersStates.map(layersStateToSidecarEntry),
  };

  const columns = Object.entries(document)
    .map(
      ([name, value]) =>
        `json('${escapeSqlString(JSON.stringify(value))}') AS "${name.replace(/"/g, '""')}"`,
    )
    .join(", ");

  await connection.query(/*sql*/ `COPY (SELECT ${columns}) TO '${dest}' (FORMAT JSON);`);
}
