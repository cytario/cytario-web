import { Credentials } from "@aws-sdk/client-sts";
import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";

import type { ConnectionConfig, ConnectionGrant } from "~/.generated/client";

/** A connection config with its grants eager-loaded. */
export type ConnectionConfigWithGrants = ConnectionConfig & { grants: ConnectionGrant[] };

/** Live health of a connection — the single source for the status dot. */
export type ConnectionStatus = "connected" | "error" | "loading";

/** A live health patch for an already-loaded connection. */
export interface ConnectionStatusUpdate {
  status: ConnectionStatus;
  statusMessage?: string;
}

/**
 * The non-secret provider attributes a connection references but does not store —
 * resolved server-side from the org catalog and shipped to the client so
 * the data-plane can construct S3 URLs and sign requests. Never carries a role ARN
 * or any credential. Absent when the catalog reference is stale/unavailable.
 */
export interface ResolvedConnectionProviderClient {
  region: string;
  endpoint: string | null;
  /** Whether the connection's provider role permits onward sharing. */
  allowsSharing: boolean;
}

/** Static config + STS credentials + live health for one connection. */
export interface Connection {
  connectionConfig: ConnectionConfigWithGrants;
  /** `null` when STS credentials could not be minted (broken connection). */
  credentials: Credentials | null;
  /** Resolved non-secret provider attributes (region/endpoint) for the data-plane. */
  provider?: ResolvedConnectionProviderClient;
  status: ConnectionStatus;
  /** Human-readable cause, set when `status === "error"`. */
  statusMessage?: string;
}

/**
 * Connections store. Single map keyed by `config.id`.
 *
 * Deliberately not persisted: STS credentials never leave in-memory state —
 * any script in the realm can read `sessionStorage` / `localStorage`.
 */
export interface ConnectionsStore {
  connections: Record<string, Connection>;
  /**
   * Replace the whole store in one write; prunes entries removed server-side.
   * Connections without credentials are kept (status `"error"`) so a broken
   * connection stays visible and manageable rather than silently vanishing.
   * A prior live probe result is preserved across re-hydration to avoid a
   * green→yellow flicker on revalidation.
   */
  setConnections: (
    configs: ConnectionConfigWithGrants[],
    credentials: Record<string, Credentials>,
    errors?: Record<string, string>,
    providers?: Record<string, ResolvedConnectionProviderClient>,
  ) => void;
  /** Patch live health for already-loaded connections (e.g. after a probe). */
  setConnectionStatuses: (updates: Record<string, ConnectionStatusUpdate>) => void;
}

const name = "ConnectionsStore";

const NO_CREDENTIALS_MESSAGE = "No credentials available for this connection.";

export const useConnectionsStore = create<ConnectionsStore>()(
  devtools(
    immer((set) => ({
      connections: {},

      setConnections: (configs, credentials, errors = {}, providers = {}) => {
        set(
          (state) => {
            const next: Record<string, Connection> = {};
            for (const connectionConfig of configs) {
              const cid = connectionConfig.id;
              const creds = credentials[cid] ?? null;
              const prev = state.connections[cid];

              let status: ConnectionStatus;
              let statusMessage: string | undefined;
              if (!creds) {
                status = "error";
                statusMessage = errors[cid] ?? NO_CREDENTIALS_MESSAGE;
              } else if (prev?.credentials) {
                status = prev.status;
                statusMessage = prev.statusMessage;
              } else {
                status = "connected";
              }

              next[cid] = {
                connectionConfig,
                credentials: creds,
                provider: providers[cid] ?? prev?.provider,
                status,
                statusMessage,
              };
            }
            state.connections = next;
          },
          false,
          "setConnections",
        );
      },

      setConnectionStatuses: (updates) => {
        set(
          (state) => {
            for (const [cid, update] of Object.entries(updates)) {
              const connection = state.connections[cid];
              if (!connection) continue;
              connection.status = update.status;
              connection.statusMessage = update.statusMessage;
            }
          },
          false,
          "setConnectionStatuses",
        );
      },
    })),
    { name, enabled: process.env.NODE_ENV !== "production" },
  ),
);
