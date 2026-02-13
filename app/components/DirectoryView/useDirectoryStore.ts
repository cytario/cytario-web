import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

export type ViewMode = "list" | "grid";

interface DirectoryStore {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  provider?: string;
  setProvider: (provider: string) => void;
  bucketName?: string;
  setBucketName: (bucketName: string) => void;
  pathName?: string;
  setPathName: (pathName?: string) => void;
  headerSlot: React.ReactNode;
  setHeaderSlot: (slot: React.ReactNode) => void;
}

const name = "DirectoryStore";

/**
 * Zustand store to manage layout state such as view mode, bucket name, and path name.
 * The store is persisted in local storage except for the header slot.
 */
export const useDirectoryStore = create<DirectoryStore>()(
  persist(
    devtools(
      (set) => ({
        viewMode: "grid",
        setViewMode: (mode) =>
          set({ viewMode: mode }, false, "setViewMode"),
        setProvider: (provider: string) =>
          set({ provider }, false, "setProvider"),
        setBucketName: (bucketName: string) =>
          set({ bucketName }, false, "setBucketName"),
        setPathName: (pathName?: string) =>
          set({ pathName }, false, "setPathName"),
        headerSlot: null,
        setHeaderSlot: (headerSlot) => set({ headerSlot }),
      }),
      { name },
    ),
    {
      name,
      partialize: (state) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { headerSlot, setHeaderSlot, ...rest } = state;
        return rest;
      },
    },
  ),
);
