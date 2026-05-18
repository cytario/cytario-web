import { Credentials } from "@aws-sdk/client-sts";
import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";

import type { ConnectionConfig } from "~/.generated/client";

/** Static config + STS credentials needed to sign requests for one connection. */
export interface Connection {
  connectionConfig: ConnectionConfig;
  credentials: Credentials;
}

/**
 * Connections store. Single map keyed by `config.name`.
 *
 * Deliberately not persisted: STS credentials never leave in-memory state —
 * any script in the realm can read `sessionStorage` / `localStorage`.
 */
export interface ConnectionsStore {
  connections: Record<string, Connection>;
  /** Replace the whole store in one write; prunes entries removed server-side. */
  setConnections: (configs: ConnectionConfig[], credentials: Record<string, Credentials>) => void;
}

const name = "ConnectionsStore";

export const useConnectionsStore = create<ConnectionsStore>()(
  devtools(
    immer((set) => ({
      connections: {},

      setConnections: (configs, credentials) => {
        set(
          (state) => {
            const next: Record<string, Connection> = {};
            for (const connectionConfig of configs) {
              const creds = credentials[connectionConfig.name];
              if (!creds) continue;
              next[connectionConfig.name] = {
                connectionConfig,
                credentials: creds,
              };
            }
            state.connections = next;
          },
          false,
          "setConnections",
        );
      },
    })),
    { name, enabled: process.env.NODE_ENV !== "production" },
  ),
);
