import type { _Object } from "@aws-sdk/client-s3";
import type { Credentials } from "@aws-sdk/client-sts";

import { findFirstImage } from "./findFirstImage";
import { mapWithConcurrency } from "./limitConcurrency";
import { resolveConnectionPrefix } from "./pathUtils";
import type { ConnectionConfig } from "~/.generated/client";
import type { TreeNode } from "~/components/DirectoryView/buildDirectoryTree";

const PREVIEW_CONCURRENCY = 4;

export interface EnrichDirectoryPreviewsArgs {
  connectionConfig: ConnectionConfig;
  credentials: Credentials;
  connectionId: string;
  provider?: { region?: string | null; endpoint?: string | null };
  signal?: AbortSignal;
}

/** Map of node id → the first imageable object found inside that directory. */
export type DirectoryPreviewMap = Record<string, _Object>;

/**
 * For each directory node, probe its contents for the first imageable object
 * and return a map of node id → `_Object`. The caller merges the results into
 * nodes immutably so downstream `useMemo` hooks see fresh references.
 */
export async function enrichDirectoryPreviews(
  nodes: TreeNode[],
  { connectionConfig, credentials, connectionId, provider, signal }: EnrichDirectoryPreviewsArgs,
): Promise<DirectoryPreviewMap> {
  const directories = nodes.filter((n) => n.type === "directory" && !n._Object);
  if (directories.length === 0) return {};

  const address = {
    id: connectionId,
    bucketName: connectionConfig.bucketName,
    region: provider?.region,
    endpoint: provider?.endpoint,
  };

  const previews = await mapWithConcurrency(directories, PREVIEW_CONCURRENCY, async (node) => {
    if (signal?.aborted) return null;
    const { prefix: dirPrefix } = resolveConnectionPrefix(connectionConfig.prefix, node.pathName);
    try {
      return (await findFirstImage(address, credentials, dirPrefix, signal)) ?? null;
    } catch {
      return null;
    }
  });

  const result: DirectoryPreviewMap = {};
  for (let i = 0; i < directories.length; i++) {
    const preview = previews[i];
    if (preview) result[directories[i].id] = preview;
  }
  return result;
}
