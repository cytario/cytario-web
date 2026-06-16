import type { Credentials } from "@aws-sdk/client-sts";

import { listObjectsClient } from "./listObjects/listObjectsClient";
import { resolveConnectionPrefix } from "./pathUtils";
import type { ConnectionConfig } from "~/.generated/client";
import { buildLevelTree, TreeNode } from "~/components/DirectoryView/buildDirectoryTree";

export interface LoadConnectionLevelArgs {
  connectionConfig: ConnectionConfig;
  credentials: Credentials;
  connectionName: string;
  /** Connection-relative path. May be empty for the bucket root. */
  urlPath: string;
  signal?: AbortSignal;
}

export interface LoadConnectionLevelResult {
  nodes: TreeNode[];
  isCapped: boolean;
}

/**
 * One-level browser-side listing for a connection. Shared by the object-
 * browser client loader and the lazy-tree expansion hook.
 */
export async function loadConnectionLevel({
  connectionConfig,
  credentials,
  connectionName,
  urlPath: rawUrlPath,
  signal,
}: LoadConnectionLevelArgs): Promise<LoadConnectionLevelResult> {
  const { urlPath, prefix } = resolveConnectionPrefix(connectionConfig.prefix, rawUrlPath);

  const { contents, commonPrefixes, isCapped } = await listObjectsClient(
    connectionConfig,
    credentials,
    { prefix, signal },
  );

  const nodes = buildLevelTree({
    contents,
    commonPrefixes,
    connectionName,
    prefix,
    urlPath,
  });

  return { nodes, isCapped };
}
