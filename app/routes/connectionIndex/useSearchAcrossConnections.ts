import { _Object } from "@aws-sdk/client-s3";
import { useEffect, useState } from "react";

import { connectionIndexSearch } from "./connectionIndexRead";
import type { ConnectionConfig } from "~/.generated/client";
import {
  buildDirectoryTree,
  type TreeNode,
} from "~/components/DirectoryView/buildDirectoryTree";
import {
  type Connection,
  useConnectionsStore,
} from "~/utils/connectionsStore/useConnectionsStore";

interface Result {
  nodes: TreeNode[];
  isLoading: boolean;
}

/**
 * Fans a substring-match query out across every connection's parquet
 * index and returns one bucket-rooted tree per connection that has matches.
 * Empty `query` returns no nodes. Connections without a built index
 * contribute nothing (silent skip).
 */
export function useSearchAcrossConnections(query: string): Result {
  const connections = useConnectionsStore((s) => s.connections);
  const [nodes, setNodes] = useState<TreeNode[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!query) return;

    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetcher pattern: mark loading while the cross-connection promise resolves
    setIsLoading(true);

    Promise.all(
      Object.values(connections).map((connection) =>
        searchOneConnection(connection, query),
      ),
    )
      .then((results) => {
        if (cancelled) return;
        setNodes(results.filter((node) => node.children.length > 0));
        setIsLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("[search] index query failed:", err);
        setNodes([]);
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [connections, query]);

  // Empty query short-circuits: derive empty result without touching state.
  if (!query) return { nodes: [], isLoading: false };
  return { nodes, isLoading };
}

async function searchOneConnection(
  connection: Connection,
  query: string,
): Promise<TreeNode> {
  const rows = await connectionIndexSearch({ connection, query });
  const objects = rows.filter(
    (row): row is _Object & { Key: string } => !!row.Key,
  );
  return buildBucketTree(connection.connectionConfig, objects);
}

function buildBucketTree(
  config: ConnectionConfig,
  objects: _Object[],
): TreeNode {
  return {
    id: `${config.name}/`,
    connectionName: config.name,
    name: config.name,
    type: "bucket" as const,
    pathName: "",
    children: buildDirectoryTree(objects, config.name, config.prefix ?? ""),
  };
}
