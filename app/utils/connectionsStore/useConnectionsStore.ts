import { Credentials } from "@aws-sdk/client-sts";
import { create } from "zustand";
import { createJSONStorage, devtools, persist } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";

import type { ConnectionConfig } from "~/utils/connectionConfig.server";
import { createMigrate } from "~/utils/persistMigration";

export interface ConnectionIndex {
  status: "unknown" | "loading" | "ready" | "missing" | "error";
  objectCount: number;
  builtAt: string | null;
}

export interface ConnectionRecord {
  credentials: Credentials;
  connectionConfig: ConnectionConfig;
  connectionIndex?: ConnectionIndex;
}

/**
 * Connections store for managing S3 bucket connections (credentials, config, index state).
 *
 * Keys are connection names (globally unique, e.g. "my-bucket" or "my-bucket-deliverables").
 */
export interface ConnectionsStore {
  connections: Record<string, ConnectionRecord>;
  setConnection: (
    key: string,
    credentials: Credentials,
    connectionConfig: ConnectionConfig,
  ) => void;
  setConnectionIndex: (key: string, index: ConnectionIndex) => void;
  clearConnection: (key: string) => void;
  clearAll: () => void;
}

const name = "ConnectionsStore";

const FALLBACK_STATE = { connections: {} };

export const useConnectionsStore = create<ConnectionsStore>()(
  devtools(
    persist(
      immer((set) => ({
        connections: {},

        setConnection: (
          key: string,
          credentials: Credentials,
          connectionConfig: ConnectionConfig,
        ) => {
          set(
            (state) => {
              state.connections[key] = {
                ...state.connections[key],
                credentials,
                connectionConfig,
              };
            },
            false,
            "setConnection",
          );
        },

        setConnectionIndex: (key: string, index: ConnectionIndex) => {
          set(
            (state) => {
              // Only set index on existing connection records
              if (state.connections[key]) {
                state.connections[key].connectionIndex = index;
              }
            },
            false,
            "setConnectionIndex",
          );
        },

        clearConnection: (key: string) => {
          set(
            (state) => {
              delete state.connections[key];
            },
            false,
            "clearConnection",
          );
        },

        clearAll: () => {
          set(
            (state) => {
              state.connections = {};
            },
            false,
            "clearAll",
          );
        },
      })),
      {
        name: "connections-storage",
        storage: createJSONStorage(() => sessionStorage),
        version: 3,
        migrate: createMigrate<Pick<ConnectionsStore, "connections">>(
          {
            1: () => FALLBACK_STATE,
            2: () => FALLBACK_STATE,
          },
          FALLBACK_STATE,
        ),
        partialize: (state) => ({
          connections: Object.fromEntries(
            (
              Object.entries(state.connections) as [
                string,
                ConnectionRecord,
              ][]
            ).map(([key, record]) => [
              key,
              {
                credentials: record.credentials,
                connectionConfig: record.connectionConfig,
              },
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
