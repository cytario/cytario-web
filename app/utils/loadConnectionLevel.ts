import type { _Object } from "@aws-sdk/client-s3";
import type { Credentials } from "@aws-sdk/client-sts";

import { mapWithConcurrency } from "./limitConcurrency";
import { listObjectsClient } from "./listObjects/listObjectsClient";
import { getPrefix, resolveConnectionPrefix } from "./pathUtils";
import type { ConnectionConfig } from "~/.generated/client";
import { buildLevelTree, TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { isImageFile } from "~/utils/fileType";

const PREVIEW_CONCURRENCY = 4;
const PREVIEW_MAX_KEYS = 100;
const PREVIEW_MAX_TOTAL = 100;

const isImagePreview = (obj: _Object) => isImageFile(obj.Key ?? "");

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

export async function loadConnectionLevel({
  connectionConfig,
  credentials,
  connectionId,
  connectionName,
  provider,
  urlPath: rawUrlPath,
  signal,
}: LoadConnectionLevelArgs): Promise<LoadConnectionLevelResult> {
  const { urlPath, prefix } = resolveConnectionPrefix(connectionConfig.prefix, rawUrlPath);

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

  await enrichDirectoryPreviews(
    nodes,
    connectionConfig,
    credentials,
    connectionId,
    provider,
    signal,
  );

  return { nodes, isCapped };
}

/**
 * For each directory node, probe its contents for the first imageable object
 * and attach it as `_Object` — the same pattern the connection-level probe uses
 * for bucket cards. Without this, directory cards render a black tile because
 * `node.id` points at the folder, not an image.
 */
async function enrichDirectoryPreviews(
  nodes: TreeNode[],
  connectionConfig: ConnectionConfig,
  credentials: Credentials,
  connectionId: string,
  provider: { region?: string | null; endpoint?: string | null } | undefined,
  signal?: AbortSignal,
): Promise<void> {
  const directories = nodes.filter((n) => n.type === "directory" && !n._Object);
  if (directories.length === 0) return;

  const previews = await mapWithConcurrency(directories, PREVIEW_CONCURRENCY, async (node) => {
    if (signal?.aborted) return null;
    try {
      const { prefix: dirPrefix } = resolveConnectionPrefix(connectionConfig.prefix, node.pathName);
      const { contents } = await listObjectsClient(
        {
          id: connectionId,
          bucketName: connectionConfig.bucketName,
          region: provider?.region,
          endpoint: provider?.endpoint,
        },
        credentials,
        {
          prefix: getPrefix(dirPrefix),
          recursive: true,
          maxKeys: PREVIEW_MAX_KEYS,
          maxTotal: PREVIEW_MAX_TOTAL,
          findFirst: isImagePreview,
          signal,
        },
      );
      return contents.find(isImagePreview) ?? null;
    } catch {
      return null;
    }
  });

  for (let i = 0; i < directories.length; i++) {
    const preview = previews[i];
    if (preview) directories[i]._Object = preview;
  }
}
