import type { Credentials } from "@aws-sdk/client-sts";

import { listObjectsClient } from "./listObjects/listObjectsClient";
import { resolveConnectionPrefix } from "./pathUtils";
import type { ConnectionConfig } from "~/.generated/client";
import { buildLevelTree, TreeNode } from "~/components/DirectoryView/buildDirectoryTree";

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

  return { nodes, isCapped };
}
