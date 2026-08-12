import { buildDirectoryTree, type TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import type { Connection } from "~/utils/connectionsStore/useConnectionsStore";
import { listObjectsClient } from "~/utils/listObjects/listObjectsClient";
import { getPrefix } from "~/utils/pathUtils";
import { CorsLikelyError } from "~/utils/signedFetch";

export interface SearchConnectionResult {
  /** Bucket-rooted TreeNode whose children are the matched paths' synthetic tree. */
  node: TreeNode;
  isCapped: boolean;
  error: boolean;
  corsBlocked: boolean;
}

/**
 * Per-connection recursive search. Calls `listObjectsClient` with `query` +
 * `recursive: true`, then builds a `TreeNode` subtree from the matched keys so
 * matched files appear under their full ancestor path. Shared by the global
 * `/search` route and any in-place tree-search caller.
 */
export async function searchConnection({
  connection,
  query,
  signal,
}: {
  connection: Connection;
  query: string;
  signal?: AbortSignal;
}): Promise<SearchConnectionResult> {
  const { connectionConfig: config, credentials, provider } = connection;
  const credentialMode = provider?.credentialMode ?? "sts";
  const prefix = getPrefix(config.prefix);
  const bucketBase = {
    id: `${config.id}/`,
    connectionId: config.id,
    connectionName: config.name,
    name: config.name,
    type: "bucket" as const,
    pathName: "",
  };

  // A broken STS connection (no minted credentials) can't be searched; surface
  // it as an errored result so the status dot stays red rather than spinning.
  // Presigned connections have null credentials by design — they route through
  // the presign endpoint instead.
  if (!credentials && credentialMode !== "presigned") {
    return {
      node: { ...bucketBase, children: [] },
      isCapped: false,
      error: true,
      corsBlocked: false,
    };
  }

  try {
    const { contents, isCapped } = await listObjectsClient(
      {
        id: config.id,
        bucketName: config.bucketName,
        region: provider?.region,
        endpoint: provider?.endpoint,
      },
      credentials,
      {
        query,
        prefix,
        recursive: true,
        signal,
      },
      credentialMode,
    );
    return {
      node: {
        ...bucketBase,
        children: buildDirectoryTree(contents, config.id, config.name, prefix ?? ""),
      },
      isCapped,
      error: false,
      corsBlocked: false,
    };
  } catch (error) {
    console.error(`Search failed for connection "${config.name}":`, error);
    return {
      node: { ...bucketBase, children: [] },
      isCapped: false,
      error: true,
      corsBlocked: error instanceof CorsLikelyError,
    };
  }
}
