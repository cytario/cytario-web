import {
  createStore as createIdBStore,
  del as idbDel,
  get as idbGet,
  keys as idbKeys,
  set as idbSet,
} from "idb-keyval";
import { create } from "zustand";
import { devtools } from "zustand/middleware";

const idbStore = createIdBStore("file-cache", "files");
/** One record listing every cached file's size — hydrate reads this only. */
const META_KEY = "__sizes__";

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

/** Read the size record; absent record = empty cache. */
const readSizes = async (): Promise<Record<string, number>> =>
  (await idbGet<Record<string, number>>(META_KEY, idbStore)) ?? {};

const writeSizes = (sizes: Record<string, number>) => idbSet(META_KEY, sizes, idbStore);

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

        const sizes = await readSizes();
        sizes[id] = data.byteLength;
        await writeSizes(sizes);

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
          "saveFile",
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
          "setFileProgress",
        );
      },

      hasFile: (id: string) => {
        const file = get().files[id];
        return file?.progress?.percentage === 100;
      },

      deleteFile: async (id: string) => {
        await idbDel(id, idbStore);

        const sizes = await readSizes();
        delete sizes[id];
        await writeSizes(sizes);

        set(
          (state) => {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { [id]: _, ...rest } = state.files;
            return { files: rest };
          },
          false,
          "deleteFile",
        );
      },

      // Metadata-only: reads the single size record, never the payloads. A
      // payload-per-key read here pulled every cached download fully into RAM
      // at startup — with a few 256 MB cached files that flooded the heap on
      // first paint. Legacy caches predating the size record simply start
      // empty; the next save of each file re-registers it.
      hydrate: async () => {
        const sizes = await readSizes();
        const allKeys = await idbKeys<string>(idbStore);
        const payloadKeys = allKeys.filter((k) => k !== META_KEY);

        const files: Record<string, FileMetadata> = {};
        for (const key of payloadKeys) {
          if (!sizes[key]) continue;
          files[key] = {
            id: key,
            progress: {
              loaded: sizes[key],
              total: sizes[key],
              percentage: 100,
            },
          };
        }

        set({ files }, false, "hydrate");
      },
    }),
    { name, enabled: process.env.NODE_ENV !== "production" },
  ),
);
