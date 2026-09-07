import type { _Object } from "@aws-sdk/client-s3";
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

export interface RawLevel {
  contents: _Object[];
  commonPrefixes: string[];
  isCapped: boolean;
}

export interface LoadRawLevelArgs {
  connectionId: string;
  connectionConfig: ConnectionConfig;
  credentials: Credentials;
  provider?: { region?: string | null; endpoint?: string | null };
  /** Resolved S3 prefix (connection prefix included). */
  prefix: string;
  signal?: AbortSignal;
}

interface LevelEntry extends RawLevel {
  fetchedAt: number;
  /** Built lazily by loadLevel; raw-only readers (search walk) leave it unset. */
  nodes?: TreeNode[];
}

/**
 * Per-connection raw-listing cache. Keys are resolved S3 prefixes so node ids
 * (`${connectionId}/${pathName}`) stay deterministic — a cache hit returns
 * the identical node references a previous navigation rendered. Both browse
 * (loadLevel) and search (loadLevelRaw, via bfsSearch) read and write the
 * same entries: one fetch per prefix per TTL regardless of who asks, and a
 * search warms the levels browse expands later. In-memory only; entries
 * expire after `TREE_CACHE_TTL_MS`.
 */
interface ConnectionTreeStore {
  levels: Record<string, Map<string, LevelEntry>>;
  /** Cache-first single-level load returning built TreeNodes; parallel callers share one S3 request. */
  loadLevel(args: LoadConnectionLevelArgs): Promise<LoadConnectionLevelResult>;
  /** Cache-first raw listing by resolved S3 prefix — the search walk's read path. */
  loadLevelRaw(args: LoadRawLevelArgs): Promise<LevelEntry>;
  /**
   * Drop cached levels. With `prefix` (resolved S3 prefix): that entry plus
   * its descendants. Without: the whole connection.
   */
  invalidate(connectionId: string, prefix?: string): void;
}

/** In-flight loads outside state — transient, no subscribers. */
const inflight = new Map<string, Promise<LevelEntry>>();

const name = "ConnectionTreeStore";

export const useConnectionTreeStore = create<ConnectionTreeStore>()(
  devtools(
    (set, get) => ({
      levels: {},

      loadLevelRaw: async ({
        connectionId,
        connectionConfig,
        credentials,
        provider,
        prefix,
        signal,
      }) => {
        const existing = get().levels[connectionId]?.get(prefix);
        if (existing && Date.now() - existing.fetchedAt < TREE_CACHE_TTL_MS) {
          return existing;
        }

        const key = `${connectionId}\u0000${prefix}`;
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
          const entry: LevelEntry = { contents, commonPrefixes, isCapped, fetchedAt: Date.now() };
          set((state) => {
            const perConnection = new Map(state.levels[connectionId] ?? []);
            perConnection.set(prefix, entry);
            return { levels: { ...state.levels, [connectionId]: perConnection } };
          });
          return entry;
        })();

        inflight.set(key, promise);
        try {
          return await promise;
        } finally {
          inflight.delete(key);
        }
      },

      loadLevel: async ({
        connectionConfig,
        credentials,
        connectionId,
        connectionName,
        provider,
        urlPath: rawUrlPath,
        signal,
      }) => {
        const { urlPath, prefix: resolved } = resolveConnectionPrefix(
          connectionConfig.prefix,
          rawUrlPath,
        );
        // Cache key: bucket root (`prefix === undefined`) maps to "".
        const cacheKey = resolved ?? "";

        const entry = await get().loadLevelRaw({
          connectionId,
          connectionConfig,
          credentials,
          provider,
          prefix: cacheKey,
          signal,
        });

        // Fast path: nodes were built by a previous loadLevel.
        if (entry.nodes) {
          return { nodes: entry.nodes, isCapped: entry.isCapped };
        }

        const nodes = buildLevelTree({
          contents: entry.contents,
          commonPrefixes: entry.commonPrefixes,
          connectionId,
          connectionName,
          prefix: resolved,
          urlPath,
        });
        set((state) => {
          const current = state.levels[connectionId]?.get(cacheKey);
          // Lost a race with a refresh or another build — keep whatever is current.
          if (!current || current.nodes) return state;
          const perConnection = new Map(state.levels[connectionId] ?? []);
          perConnection.set(cacheKey, { ...current, nodes });
          return { levels: { ...state.levels, [connectionId]: perConnection } };
        });
        return { nodes, isCapped: entry.isCapped };
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
