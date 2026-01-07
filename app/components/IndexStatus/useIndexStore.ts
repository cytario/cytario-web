import { AsyncDuckDBConnection } from "@duckdb/duckdb-wasm";
import { create } from "zustand";
import { devtools } from "zustand/middleware";

export type IndexStatus = "none" | "building" | "ready" | "error";

export interface IndexBuildProgress {
  status: IndexStatus;
  loaded: number;
  error?: string;
}

export interface BucketIndexState {
  status: IndexStatus;
  objectCount: number;
  builtAt: Date | null;
  progress: IndexBuildProgress;
  connection: AsyncDuckDBConnection | null;
}

interface IndexStore {
  indexes: Record<string, BucketIndexState>;

  // State getters
  getIndex: (bucketKey: string) => BucketIndexState | null;
  hasIndex: (bucketKey: string) => boolean;
  isBuilding: (bucketKey: string) => boolean;

  // State setters
  setIndexState: (bucketKey: string, state: Partial<BucketIndexState>) => void;
  setProgress: (bucketKey: string, progress: IndexBuildProgress) => void;
  setConnection: (
    bucketKey: string,
    connection: AsyncDuckDBConnection | null
  ) => void;
  setReady: (bucketKey: string, objectCount: number) => void;
  setError: (bucketKey: string, error: string) => void;
  clearIndex: (bucketKey: string) => void;
  clearAll: () => void;
}

const createInitialState = (): BucketIndexState => ({
  status: "none",
  objectCount: 0,
  builtAt: null,
  progress: { status: "none", loaded: 0 },
  connection: null,
});

const name = "IndexStore";

export const useIndexStore = create<IndexStore>()(
  devtools(
    (set, get) => ({
      indexes: {},

      getIndex: (bucketKey: string) => {
        return get().indexes[bucketKey] ?? null;
      },

      hasIndex: (bucketKey: string) => {
        const index = get().indexes[bucketKey];
        return index?.status === "ready";
      },

      isBuilding: (bucketKey: string) => {
        const index = get().indexes[bucketKey];
        return index?.status === "building";
      },

      setIndexState: (bucketKey: string, state: Partial<BucketIndexState>) => {
        set(
          (store) => ({
            indexes: {
              ...store.indexes,
              [bucketKey]: {
                ...(store.indexes[bucketKey] ?? createInitialState()),
                ...state,
              },
            },
          }),
          false,
          "setIndexState"
        );
      },

      setProgress: (bucketKey: string, progress: IndexBuildProgress) => {
        set(
          (store) => ({
            indexes: {
              ...store.indexes,
              [bucketKey]: {
                ...(store.indexes[bucketKey] ?? createInitialState()),
                status: progress.status,
                progress,
              },
            },
          }),
          false,
          "setProgress"
        );
      },

      setConnection: (
        bucketKey: string,
        connection: AsyncDuckDBConnection | null
      ) => {
        set(
          (store) => ({
            indexes: {
              ...store.indexes,
              [bucketKey]: {
                ...(store.indexes[bucketKey] ?? createInitialState()),
                connection,
              },
            },
          }),
          false,
          "setConnection"
        );
      },

      setReady: (bucketKey: string, objectCount: number) => {
        set(
          (store) => ({
            indexes: {
              ...store.indexes,
              [bucketKey]: {
                ...(store.indexes[bucketKey] ?? createInitialState()),
                status: "ready",
                objectCount,
                builtAt: new Date(),
                progress: { status: "ready", loaded: objectCount },
              },
            },
          }),
          false,
          "setReady"
        );
      },

      setError: (bucketKey: string, error: string) => {
        set(
          (store) => ({
            indexes: {
              ...store.indexes,
              [bucketKey]: {
                ...(store.indexes[bucketKey] ?? createInitialState()),
                status: "error",
                progress: { status: "error", loaded: 0, error },
              },
            },
          }),
          false,
          "setError"
        );
      },

      clearIndex: (bucketKey: string) => {
        set(
          (store) => {
            const index = store.indexes[bucketKey];
            // Close connection if exists
            if (index?.connection) {
              index.connection.close().catch(console.error);
            }
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { [bucketKey]: _, ...rest } = store.indexes;
            return { indexes: rest };
          },
          false,
          "clearIndex"
        );
      },

      clearAll: () => {
        const { indexes } = get();
        // Close all connections
        Object.values(indexes).forEach((index) => {
          if (index.connection) {
            index.connection.close().catch(console.error);
          }
        });
        set({ indexes: {} }, false, "clearAll");
      },
    }),
    { name }
  )
);
