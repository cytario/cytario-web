import { Credentials } from "@aws-sdk/client-sts";
import { create } from "zustand";
import { createJSONStorage, devtools, persist } from "zustand/middleware";

import { BucketConfig } from "~/.generated/client";

export interface BucketIndex {
  status: "unknown" | "loading" | "ready" | "missing" | "error";
  objectCount: number;
  builtAt: string | null;
}

export interface ConnectionRecord {
  credentials: Credentials;
  bucketConfig?: BucketConfig;
  bucketIndex?: BucketIndex;
}

/**
 * Connections store for managing S3 bucket connections (credentials, config).
 *
 * IMPORTANT: The key used in this store should be "provider/bucketName",
 * not the full file path. Connections are per-bucket, not per-file.
 *
 * Example:
 * - Correct: setConnection("aws/my-bucket", credentials, bucketConfig)
 * - Incorrect: setConnection("aws/my-bucket/path/to/file.csv", credentials)
 */
export interface ConnectionsStore {
  connections: Record<string, ConnectionRecord>;
  setConnection: (
    key: string,
    credentials: Credentials,
    bucketConfig?: BucketConfig,
  ) => void;
  setBucketIndex: (key: string, bucketIndex: BucketIndex) => void;
  clearConnection: (key: string) => void;
  clearAll: () => void;
}

const name = "ConnectionsStore";

export const useConnectionsStore = create<ConnectionsStore>()(
  devtools(
    persist(
      (set) => ({
        connections: {},

        setConnection: (
          key: string,
          credentials: Credentials,
          bucketConfig?: BucketConfig,
        ) => {
          set(
            (state) => ({
              connections: {
                ...state.connections,
                [key]: {
                  ...state.connections[key],
                  credentials,
                  ...(bucketConfig && { bucketConfig }),
                },
              },
            }),
            false,
            "setConnection",
          );
        },

        setBucketIndex: (key: string, bucketIndex: BucketIndex) => {
          set(
            (state) => ({
              connections: {
                ...state.connections,
                [key]: {
                  ...state.connections[key],
                  bucketIndex,
                },
              },
            }),
            false,
            "setBucketIndex",
          );
        },

        clearConnection: (key: string) => {
          set(
            (state) => {
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              const { [key]: _, ...rest } = state.connections;
              return { connections: rest };
            },
            false,
            "clearConnection",
          );
        },

        clearAll: () => {
          set({ connections: {} }, false, "clearAll");
        },
      }),
      {
        name: "connections-storage",
        storage: createJSONStorage(() => sessionStorage),
        partialize: (state) => ({
          connections: Object.fromEntries(
            Object.entries(state.connections).map(([key, record]) => [
              key,
              { credentials: record.credentials, bucketConfig: record.bucketConfig },
            ]),
          ),
        }),
      },
    ),
    { name },
  ),
);
