import { create } from "zustand";
import { createJSONStorage, devtools, persist } from "zustand/middleware";

import { TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { createResourceId } from "~/utils/resourceId";

const MAX_ITEMS = 12;

interface RecentlyViewedStore {
  items: TreeNode[];
  addItem: (node: TreeNode) => void;
  removeItem: (node: TreeNode) => void;
  clearAll: () => void;
}

const name = "RecentlyViewedStore";

function getNodeId(node: TreeNode) {
  return createResourceId(node.provider, node.bucketName, node.pathName);
}

export const useRecentlyViewedStore = create<RecentlyViewedStore>()(
  devtools(
    persist(
      (set) => ({
        items: [],

        addItem: (node) => {
          const id = getNodeId(node);
          set(
            (state) => {
              const filtered = state.items.filter(
                (item) => getNodeId(item) !== id,
              );
              return {
                items: [node, ...filtered].slice(0, MAX_ITEMS),
              };
            },
            false,
            "addItem",
          );
        },

        removeItem: (node) => {
          const id = getNodeId(node);
          set(
            (state) => ({
              items: state.items.filter((item) => getNodeId(item) !== id),
            }),
            false,
            "removeItem",
          );
        },

        clearAll: () => {
          set({ items: [] }, false, "clearAll");
        },
      }),
      {
        name: "recently-viewed-storage",
        storage: createJSONStorage(() => localStorage),
      },
    ),
    { name },
  ),
);
