import type { Credentials } from "@aws-sdk/client-sts";
import { create } from "zustand";
import { devtools } from "zustand/middleware";

import type { ConnectionConfig } from "~/.generated/client";
import { buildLevelTree, type TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { TREE_CACHE_TTL_MS } from "~/utils/listingLimits";
import { listObjectsClient } from "~/utils/listObjects/listObjectsClient";
import { resolveConnectionPrefix } from "~/utils/pathUtils";

export interface LoadConnectionLevelArgs {
  connectionConfig: ConnectionConfig;
  credentials: Credentials;
  connectionId: string;
  connectionName: string;
  /** Resolved non-secret provider address (region/endpoint) from the catalog. */
  provider?: { region?: string | null; endpoint?: string | null };
  /** Connection-relative path. May be empty for the bucket root. */
  urlPath: string;
  signal?: AbortSignal;
}

export interface LoadConnectionLevelResult {
  nodes: TreeNode[];
  isCapped: boolean;
}

interface LevelEntry {
  nodes: TreeNode[];
  fetchedAt: number;
  isCapped: boolean;
}

/**
 * Per-connection level cache. Keys are resolved S3 prefixes so node ids
 * (`${connectionId}/${pathName}`) stay deterministic — a cache hit returns
 * the identical node references a previous navigation rendered.
 * In-memory only; entries expire after `TREE_CACHE_TTL_MS`.
 */
interface ConnectionTreeStore {
  levels: Record<string, Map<string, LevelEntry>>;
  /** Cache-first single-level load; parallel callers share one S3 request. */
  loadLevel(args: LoadConnectionLevelArgs): Promise<LoadConnectionLevelResult>;
  /**
   * Drop cached levels. With `prefix` (resolved S3 prefix): that entry plus
   * its descendants. Without: the whole connection.
   */
  invalidate(connectionId: string, prefix?: string): void;
}

/** In-flight loads outside state — transient, no subscribers. */
const inflight = new Map<string, Promise<LoadConnectionLevelResult>>();

const name = "ConnectionTreeStore";

export const useConnectionTreeStore = create<ConnectionTreeStore>()(
  devtools(
    (set, get) => ({
      levels: {},

      loadLevel: async ({
        connectionConfig,
        credentials,
        connectionId,
        connectionName,
        provider,
        urlPath: rawUrlPath,
        signal,
      }) => {
        const { urlPath, prefix } = resolveConnectionPrefix(connectionConfig.prefix, rawUrlPath);
        // Cache key: bucket root (`prefix === undefined`) maps to "".
        const cacheKey = prefix ?? "";

        const existing = get().levels[connectionId]?.get(cacheKey);
        if (existing && Date.now() - existing.fetchedAt < TREE_CACHE_TTL_MS) {
          return { nodes: existing.nodes, isCapped: existing.isCapped };
        }

        const key = `${connectionId}\u0000${cacheKey}`;
        const pending = inflight.get(key);
        if (pending) return pending;

        const promise = (async () => {
          const { contents, commonPrefixes, isCapped } = await listObjectsClient(
            {
              id: connectionId,
              bucketName: connectionConfig.bucketName,
              region: provider?.region,
              endpoint: provider?.endpoint,
            },
            credentials,
            { prefix, signal },
          );
          const nodes = buildLevelTree({
            contents,
            commonPrefixes,
            connectionId,
            connectionName,
            prefix,
            urlPath,
          });
          set((state) => {
            const perConnection = new Map(state.levels[connectionId] ?? []);
            perConnection.set(cacheKey, { nodes, fetchedAt: Date.now(), isCapped });
            return { levels: { ...state.levels, [connectionId]: perConnection } };
          });
          return { nodes, isCapped };
        })();

        inflight.set(key, promise);
        try {
          return await promise;
        } finally {
          inflight.delete(key);
        }
      },

      invalidate: (connectionId, prefix) =>
        set((state) => {
          const perConnection = state.levels[connectionId];
          if (!perConnection) return state;
          if (prefix === undefined) {
            const levels = { ...state.levels };
            delete levels[connectionId];
            return { levels };
          }
          const normalized = prefix.endsWith("/") ? prefix : `${prefix}/`;
          const next = new Map(perConnection);
          for (const key of next.keys()) {
            if (key === prefix || key.startsWith(normalized)) next.delete(key);
          }
          return { levels: { ...state.levels, [connectionId]: next } };
        }),
    }),
    { name },
  ),
);

/** Test-only: drop all cached levels. */
export function __resetConnectionTreeStore(): void {
  useConnectionTreeStore.setState({ levels: {} });
  inflight.clear();
}
