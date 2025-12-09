import {
  createStore as createIdBStore,
  del as idbDel,
  get as idbGet,
  keys as idbKeys,
  set as idbSet,
} from "idb-keyval";
import { create } from "zustand";
import { devtools } from "zustand/middleware";

// Create a custom IndexedDB store for file cache
const idbStore = createIdBStore("file-cache", "files");

export interface DownloadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

interface FileMetadata {
  id: string;
  progress?: DownloadProgress;
}

interface FileStore {
  files: Record<string, FileMetadata>;
  getFile: (id: string) => Promise<Uint8Array | null>;
  saveFile: (id: string, data: Uint8Array) => Promise<void>;
  setFileProgress: (id: string, progress: DownloadProgress) => void;
  hasFile: (id: string) => boolean;
  deleteFile: (id: string) => Promise<void>;
  hydrate: () => Promise<void>;
}

const name = "FileStore";

export const useFileStore = create<FileStore>()(
  devtools(
    (set, get) => ({
      files: {},

      getFile: async (id: string) => {
        const data = await idbGet<Uint8Array>(id, idbStore);
        return data ?? null;
      },

      saveFile: async (id: string, data: Uint8Array) => {
        await idbSet(id, data, idbStore);

        // Mark as complete
        set(
          (state) => ({
            files: {
              ...state.files,
              [id]: {
                id,
                progress: {
                  loaded: data.length,
                  total: data.length,
                  percentage: 100,
                },
              },
            },
          }),
          false,
          "saveFile"
        );
      },

      setFileProgress: (id: string, progress: DownloadProgress) => {
        set(
          (state) => ({
            files: {
              ...state.files,
              [id]: {
                id,
                progress,
              },
            },
          }),
          false,
          "setFileProgress"
        );
      },

      hasFile: (id: string) => {
        const file = get().files[id];
        return file?.progress?.percentage === 100;
      },

      deleteFile: async (id: string) => {
        await idbDel(id, idbStore);

        set(
          (state) => {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { [id]: _, ...rest } = state.files;
            return { files: rest };
          },
          false,
          "deleteFile"
        );
      },

      hydrate: async () => {
        const allKeys = await idbKeys<string>(idbStore);

        // Get sizes for all files
        const filesWithSizes = await Promise.all(
          allKeys.map(async (key) => {
            const data = await idbGet<Uint8Array>(key, idbStore);
            return {
              key,
              size: data?.length ?? 0,
            };
          })
        );

        set(
          (state) => {
            const files = { ...state.files };

            // Add any keys from IndexedDB that aren't in the store
            for (const { key, size } of filesWithSizes) {
              if (!files[key]) {
                files[key] = {
                  id: key,
                  progress: {
                    loaded: size,
                    total: size,
                    percentage: 100,
                  },
                };
              }
            }

            // Remove any keys from store that aren't in IndexedDB
            for (const key of Object.keys(files)) {
              if (!allKeys.includes(key)) {
                delete files[key];
              }
            }

            return { files };
          },
          false,
          "hydrate"
        );
      },
    }),
    { name }
  )
);
