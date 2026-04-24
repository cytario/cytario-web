import { useEffect, useState } from "react";

import {
  type ConnectionIndexRow,
  connectionIndexRead,
} from "./connectionIndexRead";
import {
  buildDirectoryTree,
  type TreeNode,
} from "~/components/DirectoryView/buildDirectoryTree";
import type { Connection } from "~/utils/connectionsStore/useConnectionsStore";

interface UseDirectoryListingArgs {
  connection: Connection;
  /** Full S3 key prefix to list (includes connection prefix). */
  prefix: string;
  /** Path relative to connection root, used as buildDirectoryTree's basePath. */
  urlPath: string;
  /** Skip the listing (e.g. when viewing a single file). */
  enabled: boolean;
}

interface UseDirectoryListingResult {
  nodes: TreeNode[];
  /** Raw rows from the index — exposed so drift detection can compare against the live slice. */
  rows: ConnectionIndexRow[];
  isLoading: boolean;
  error: Error | null;
}

/**
 * Client-side directory listing backed by the parquet index. Reads via
 * DuckDB-WASM (`connectionIndexRead`) and constructs the tree in the browser.
 *
 * Assumes the index already exists — the objects loader redirects to the
 * /connectionIndex/:name page on miss, so by the time this hook runs the
 * parquet is in S3.
 *
 * Previous nodes stay visible during prefix transitions (no flicker to a
 * loading state); the spinner only appears on the very first load.
 */
export function useDirectoryListing({
  connection,
  prefix,
  urlPath,
  enabled,
}: UseDirectoryListingArgs): UseDirectoryListingResult {
  const [nodes, setNodes] = useState<TreeNode[]>([]);
  const [rows, setRows] = useState<ConnectionIndexRow[]>([]);
  const [isLoading, setIsLoading] = useState(enabled);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    connectionIndexRead({ connection, listPath: prefix })
      .then((rows) => {
        if (cancelled) return;
        const objects = rows.map((row) => ({
          Key: row.key,
          Size: row.size,
          LastModified: row.lastModified
            ? new Date(row.lastModified)
            : undefined,
          ETag: row.etag,
        }));
        setRows(rows);
        setNodes(
          buildDirectoryTree(
            objects,
            connection.connectionConfig.name,
            prefix,
            urlPath,
          ),
        );
        setError(null);
        setIsLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err : new Error(String(err)));
        setRows([]);
        setNodes([]);
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, connection, prefix, urlPath]);

  if (!enabled) {
    return { nodes: [], rows: [], isLoading: false, error: null };
  }
  return { nodes, rows, isLoading, error };
}
