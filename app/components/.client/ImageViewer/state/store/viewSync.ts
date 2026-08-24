import type { createViewerStore } from "./createViewerStore";
import type { LayersStateEntry } from "./types";
import { layersStateToSidecarEntry, type ViewSettingsEntry } from "~/utils/db/viewSettingsSchema";
import { readViewSettings, writeViewSettings } from "~/utils/db/writeViewSettings";

type ViewerStoreApi = ReturnType<typeof createViewerStore>;

const SAVE_DEBOUNCE_MS = 800;

function hasSharedViews(layersStates: LayersStateEntry[]): boolean {
  return layersStates.some((ls) => ls.shared);
}

function sharedViewsOnly(layersStates: LayersStateEntry[]): LayersStateEntry[] {
  return layersStates.filter((ls) => ls.shared);
}

export function attachViewSync(store: ViewerStoreApi): void {
  let persisted: ViewSettingsEntry[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  let flushing = false;

  readViewSettings(store.getState().id)
    .then((doc) => {
      if (!doc || doc.views.length === 0) return;
      persisted = doc.views;
      store.getState().loadSharedViews(doc.views);
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
      const { id, layersStates } = store.getState();
      const sharedViews = sharedViewsOnly(layersStates);
      if (sharedViews.length === 0) return;

      const currentEntries = sharedViews.map(layersStateToSidecarEntry);
      const currentJson = JSON.stringify(currentEntries);
      const persistedJson = JSON.stringify(persisted);
      if (currentJson === persistedJson) return;

      await writeViewSettings(id, sharedViews);
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
      if (hasSharedViews(store.getState().layersStates)) {
        schedule();
      }
    },
  );
}
