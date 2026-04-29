import { Credentials } from "@aws-sdk/client-sts";
import { create } from "zustand";
import { createJSONStorage, devtools, persist } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";

import type { ConnectionConfig } from "~/.generated/client";
import { createMigrate } from "~/utils/persistMigration";

/**
 * A connection joins the static config (DB metadata) with the credentials
 * (STS-minted) needed to make signed requests.
 */
export interface Connection {
  connectionConfig: ConnectionConfig;
  credentials: Credentials;
}

/**
 * Connections store. Single map keyed by `config.name`.
 *
 * Note: credentials are stored per-connection, not per-bucket. STS dedup
 * happens server-side at mint time (`getAllSessionCredentials`); on the
 * client we keep a flat per-connection mapping so connections that share
 * a bucket but differ in role can hold distinct credentials.
 */
export interface ConnectionsStore {
  connections: Record<string, Connection>;
  setConnection: (
    credentials: Credentials,
    connectionConfig: ConnectionConfig,
  ) => void;
  /**
   * Replace the whole store contents in a single write. Joins the
   * server-shaped inputs (configs[] + bucket-keyed credentials) into the
   * client's per-connection structure. Prunes connections deleted
   * server-side.
   */
  reconcileConnections: (
    configs: ConnectionConfig[],
    bucketCredentials: Record<string, Credentials>,
  ) => void;
}

const name = "ConnectionsStore";

const FALLBACK_STATE: Pick<ConnectionsStore, "connections"> = {
  connections: {},
};

export const useConnectionsStore = create<ConnectionsStore>()(
  devtools(
    persist(
      immer((set) => ({
        connections: {},

        setConnection: (credentials, connectionConfig) => {
          set(
            (state) => {
              state.connections[connectionConfig.name] = {
                connectionConfig,
                credentials,
              };
            },
            false,
            "setConnection",
          );
        },

        reconcileConnections: (configs, bucketCredentials) => {
          set(
            (state) => {
              const next: Record<string, Connection> = {};
              for (const connectionConfig of configs) {
                const credentials =
                  bucketCredentials[connectionConfig.bucketName];
                if (!credentials) continue;
                next[connectionConfig.name] = { connectionConfig, credentials };
              }
              state.connections = next;
            },
            false,
            "reconcileConnections",
          );
        },
      })),
      {
        name: "connections-storage",
        storage: createJSONStorage(() => sessionStorage),
        version: 5,
        migrate: createMigrate<typeof FALLBACK_STATE>(
          {
            1: () => FALLBACK_STATE,
            2: () => FALLBACK_STATE,
            3: () => FALLBACK_STATE,
            4: () => FALLBACK_STATE,
          },
          FALLBACK_STATE,
        ),
        partialize: (state) => ({
          connections: state.connections,
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
