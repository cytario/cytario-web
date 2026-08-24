import type { createViewerStore } from "./createViewerStore";
import type { LayersStateEntry } from "./types";
import { layersStateToSidecarEntry, type ViewSettingsEntry } from "~/utils/db/viewSettingsSchema";
import { readViewSettings, writeViewSettings } from "~/utils/db/writeViewSettings";

type ViewerStoreApi = ReturnType<typeof createViewerStore>;

const SAVE_DEBOUNCE_MS = 800;

function hasOwnSharedViews(layersStates: LayersStateEntry[], currentUserId: string): boolean {
  return layersStates.some((ls) => ls.shared && ls.author === currentUserId);
}

function ownSharedViewsOnly(
  layersStates: LayersStateEntry[],
  currentUserId: string,
): LayersStateEntry[] {
  return layersStates.filter((ls) => ls.shared && ls.author === currentUserId);
}

export function attachViewSync(store: ViewerStoreApi): void {
  let persisted: ViewSettingsEntry[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  let flushing = false;

  readViewSettings(store.getState().id)
    .then((views) => {
      if (views.length === 0) return;
      persisted = views;
      store.getState().loadSharedViews(views);
    })
    .catch((error) => console.error("[viewSettings] load failed:", error));

  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void flush(), SAVE_DEBOUNCE_MS);
  };

  const flush = async () => {
    timer = null;
    if (flushing) return schedule();
    flushing = true;
    try {
      const { id, layersStates, currentUserId } = store.getState();
      const sharedViews = ownSharedViewsOnly(layersStates, currentUserId);
      if (sharedViews.length === 0) return;

      const currentEntries = sharedViews.map(layersStateToSidecarEntry);
      const currentJson = JSON.stringify(currentEntries);
      const persistedJson = JSON.stringify(persisted);
      if (currentJson === persistedJson) return;

      await writeViewSettings(id, currentUserId, sharedViews);
      persisted = currentEntries;
    } catch (error) {
      console.error("[viewSettings] save failed:", error);
    } finally {
      flushing = false;
    }
  };

  store.subscribe(
    (s) => s.layersStates,
    () => {
      if (hasOwnSharedViews(store.getState().layersStates, store.getState().currentUserId)) {
        schedule();
      }
    },
  );
}
