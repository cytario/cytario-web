import { SidecarRepository } from "./sidecarRepository";
import {
  layersStateToSidecarEntry,
  type ViewSettingsEntry,
  VIEW_SETTINGS_SCHEMA_VERSION,
  type ViewSettingsDocument,
} from "./viewSettingsSchema";
import { resolveResourceId } from "../connectionsStore/selectors";
import type { LayersStateEntry } from "~/components/.client/ImageViewer/state/store/types";

export async function readViewSettings(resourceId: string): Promise<ViewSettingsEntry[]> {
  const documents = await SidecarRepository.readAll<ViewSettingsDocument>(resourceId, "settings");
  const allViews: ViewSettingsEntry[] = [];
  for (const [userId, doc] of Object.entries(documents)) {
    if (!doc?.views?.length) continue;
    for (const view of doc.views) {
      allViews.push({ ...view, author: view.author || userId });
    }
  }
  return allViews;
}

export async function writeViewSettings(
  resourceId: string,
  userId: string,
  layersStates: LayersStateEntry[],
): Promise<void> {
  const { s3Uri } = resolveResourceId(resourceId);

  const document: ViewSettingsDocument = {
    cytario: {
      schemaVersion: VIEW_SETTINGS_SCHEMA_VERSION,
      kind: "settings",
      image: s3Uri,
      author: userId,
    },
    views: layersStates.map(layersStateToSidecarEntry),
  };

  await new SidecarRepository(resourceId, userId).write("settings", document);
}
