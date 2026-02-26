import { create } from "zustand";
import { createJSONStorage, devtools, persist } from "zustand/middleware";

import { createResourceId } from "~/utils/resourceId";

const MAX_ITEMS = 10;

export interface PinnedPath {
  provider: string;
  bucketName: string;
  pathName: string;
  displayName: string;
}

interface PinnedPathsStore {
  items: PinnedPath[];
  addPin: (pin: PinnedPath) => void;
  removePin: (id: string) => void;
  clearAll: () => void;
}

const name = "PinnedPathsStore";

function getPinId(pin: PinnedPath) {
  return createResourceId(pin.provider, pin.bucketName, pin.pathName);
}

export const usePinnedPathsStore = create<PinnedPathsStore>()(
  devtools(
    persist(
      (set) => ({
        items: [],

        addPin: (pin) => {
          const id = getPinId(pin);
          set(
            (state) => {
              const filtered = state.items.filter(
                (item) => getPinId(item) !== id,
              );
              return {
                items: [pin, ...filtered].slice(0, MAX_ITEMS),
              };
            },
            false,
            "addPin",
          );
        },

        removePin: (id) => {
          set(
            (state) => ({
              items: state.items.filter((item) => getPinId(item) !== id),
            }),
            false,
            "removePin",
          );
        },

        clearAll: () => {
          set({ items: [] }, false, "clearAll");
        },
      }),
      {
        name: "pinned-paths-storage",
        storage: createJSONStorage(() => localStorage),
      },
    ),
    { name },
  ),
);

/** Check if a path is pinned by its resource ID. */
export function selectIsPinned(
  provider: string,
  bucketName: string,
  pathName: string,
) {
  return (state: PinnedPathsStore) =>
    state.items.some(
      (item) =>
        getPinId(item) ===
        createResourceId(provider, bucketName, pathName),
    );
}
