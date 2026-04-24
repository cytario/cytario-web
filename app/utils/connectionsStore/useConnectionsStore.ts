import { Credentials } from "@aws-sdk/client-sts";
import { create } from "zustand";
import { createJSONStorage, devtools, persist } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";

import type { ConnectionConfig } from "~/.generated/client";
import { createMigrate } from "~/utils/persistMigration";

/**
 * The joined view of a single connection — produced by `selectConnection` for
 * callers that want config + credentials together. Not the persisted shape.
 */
export interface ConnectionRecord {
  credentials: Credentials;
  connectionConfig: ConnectionConfig;
}

/**
 * Connections store. Two concerns, two maps:
 *
 * - `connectionConfigs` keyed by `config.name` — static metadata from the DB.
 * - `bucketCredentials` keyed by `config.bucketName` — STS-minted per bucket,
 *   shared across any connections that point at the same bucket (one mint,
 *   one refresh, no torn state).
 */
export interface ConnectionsStore {
  connectionConfigs: Record<string, ConnectionConfig>;
  bucketCredentials: Record<string, Credentials>;
  setConnection: (
    credentials: Credentials,
    connectionConfig: ConnectionConfig,
  ) => void;
}

const name = "ConnectionsStore";

const FALLBACK_STATE: Pick<
  ConnectionsStore,
  "connectionConfigs" | "bucketCredentials"
> = {
  connectionConfigs: {},
  bucketCredentials: {},
};

export const useConnectionsStore = create<ConnectionsStore>()(
  devtools(
    persist(
      immer((set) => ({
        connectionConfigs: {},
        bucketCredentials: {},

        setConnection: (credentials, connectionConfig) => {
          set(
            (state) => {
              state.connectionConfigs[connectionConfig.name] = connectionConfig;
              state.bucketCredentials[connectionConfig.bucketName] = credentials;
            },
            false,
            "setConnection",
          );
        },
      })),
      {
        name: "connections-storage",
        storage: createJSONStorage(() => sessionStorage),
        version: 4,
        migrate: createMigrate<typeof FALLBACK_STATE>(
          {
            1: () => FALLBACK_STATE,
            2: () => FALLBACK_STATE,
            3: () => FALLBACK_STATE,
          },
          FALLBACK_STATE,
        ),
        partialize: (state) => ({
          connectionConfigs: state.connectionConfigs,
          bucketCredentials: state.bucketCredentials,
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
