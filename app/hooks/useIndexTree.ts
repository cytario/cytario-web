import { useEffect, useState } from "react";

import {
  buildDirectoryTree,
  type TreeNode,
} from "~/components/DirectoryView/buildDirectoryTree";
import type { ObjectPresignedUrl } from "~/routes/objects.route";
import { listPrefix } from "~/utils/connectionIndex/queryIndex";
import { select, useConnectionsStore } from "~/utils/connectionsStore";

/**
 * Populates bucket children from the parquet index (client-side via DuckDB-WASM).
 *
 * Given a root TreeNode whose children are empty bucket stubs, this hook loads
 * each bucket's contents from its `.cytario/index.parquet` file and returns
 * the root with fully-built subtrees.
 *
 * Assumes the index exists for every connection.
 */
export function useIndexTree(initialRoot: TreeNode): TreeNode {
  const [root, setRoot] = useState(initialRoot);
  const connections = useConnectionsStore(select.connections);

  useEffect(() => {
    const buckets =
      initialRoot.children?.filter((n) => n.type === "bucket") ?? [];
    if (buckets.length === 0) return;

    // Wait until all bucket connections have credentials in the store
    const allReady = buckets.every((b) => connections[b.alias]?.credentials);
    if (!allReady) return;

    let cancelled = false;

    Promise.all(
      buckets.map(async (bucket) => {
        const conn = connections[bucket.alias];
        if (!conn) return bucket;

        try {
          const results = await listPrefix(
            bucket.alias,
            conn.connectionConfig.name,
            conn.connectionConfig.prefix,
            "",
            conn.credentials,
            conn.connectionConfig,
          );

          const objects: ObjectPresignedUrl[] = results.map((r) => ({
            Key: r.key,
            Size: r.size,
            LastModified: r.lastModified ? new Date(r.lastModified) : undefined,
            ETag: r.etag,
            presignedUrl: "",
          }));

          const tree = buildDirectoryTree(
            conn.connectionConfig.name,
            objects,
            conn.connectionConfig.provider,
            bucket.alias,
            bucket.name,
            conn.connectionConfig.prefix,
          );
          return { ...tree, type: "bucket" as const };
        } catch (err) {
          console.warn(
            `[useIndexTree] Failed to load index for ${bucket.alias}:`,
            err,
          );
          return bucket;
        }
      }),
    ).then((populated) => {
      if (!cancelled) {
        setRoot({ ...initialRoot, children: populated });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [initialRoot, connections]);

  return root;
}
