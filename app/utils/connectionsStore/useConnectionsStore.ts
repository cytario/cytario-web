import { Credentials } from "@aws-sdk/client-sts";
import { create } from "zustand";
import { createJSONStorage, devtools, persist } from "zustand/middleware";

import { ConnectionConfig } from "~/utils/connectionConfig";

export interface ConnectionIndex {
  status: "unknown" | "loading" | "ready" | "missing" | "error";
  objectCount: number;
  builtAt: string | null;
}

export interface ConnectionRecord {
  credentials: Credentials;
  connectionConfig?: ConnectionConfig;
  connectionIndex?: ConnectionIndex;
}

/**
 * Connections store for managing S3 bucket connections (credentials, config).
 *
 * Keys are connection aliases (globally unique, e.g. "my-bucket" or "my-bucket-deliverables").
 */
export interface ConnectionsStore {
  connections: Record<string, ConnectionRecord>;
  setConnection: (
    key: string,
    credentials: Credentials,
    connectionConfig?: ConnectionConfig,
  ) => void;
  setConnectionIndex: (key: string, connectionIndex: ConnectionIndex) => void;
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
          connectionConfig?: ConnectionConfig,
        ) => {
          set(
            (state) => ({
              connections: {
                ...state.connections,
                [key]: {
                  ...state.connections[key],
                  credentials,
                  ...(connectionConfig && { connectionConfig }),
                },
              },
            }),
            false,
            "setConnection",
          );
        },

        setConnectionIndex: (key: string, connectionIndex: ConnectionIndex) => {
          set(
            (state) => ({
              connections: {
                ...state.connections,
                [key]: {
                  ...state.connections[key],
                  connectionIndex,
                },
              },
            }),
            false,
            "setConnectionIndex",
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
        version: 2,
        migrate: () => ({ connections: {} }),
        partialize: (state) => ({
          connections: Object.fromEntries(
            Object.entries(state.connections).map(([key, record]) => [
              key,
              { credentials: record.credentials, connectionConfig: record.connectionConfig },
            ]),
          ),
        }),
        onRehydrateStorage: () => (_state, error) => {
          if (error)
            console.error("[ConnectionsStore] Rehydration failed:", error);
        },
      },
    ),
    { name },
  ),
);
