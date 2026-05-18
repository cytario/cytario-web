import { _Object } from "@aws-sdk/client-s3";
import { Credentials } from "@aws-sdk/client-sts";
import { type ClientLoaderFunctionArgs } from "react-router";

import type { LoaderData, loadConnections } from "./connections.loader";
import type { ConnectionConfig } from "~/.generated/client";
import { TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { isImageFile } from "~/utils/fileType";
import { mapWithConcurrency } from "~/utils/limitConcurrency";
import { listObjectsClient } from "~/utils/listObjectsClient";
import { getPrefix } from "~/utils/pathUtils";
import { CorsLikelyError } from "~/utils/signedFetch";

const PREVIEW_CONCURRENCY = 4;

const isImagePreview = (obj: _Object) => isImageFile(obj.Key ?? "");

interface ConnectionProbeResult {
  previewObj?: _Object;
  status: "connected" | "error";
  errorMessage?: string;
}

async function probeConnection(
  config: ConnectionConfig,
  credentials: Credentials,
  signal?: AbortSignal,
): Promise<ConnectionProbeResult> {
  try {
    const { contents } = await listObjectsClient(config, credentials, {
      // Trailing slash required: the session policy only allows `<prefix>/`
      // and `<prefix>/*`, so a bare `<prefix>` value 403s.
      prefix: getPrefix(config.prefix),
      recursive: true,
      maxKeys: 100,
      maxTotal: 100,
      findFirst: isImagePreview,
      signal,
    });
    return { previewObj: contents.find(isImagePreview), status: "connected" };
  } catch (error) {
    if (error instanceof CorsLikelyError) {
      return {
        status: "error",
        errorMessage: "Browser blocked from reading the bucket — check the bucket's CORS policy.",
      };
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    return { status: "error", errorMessage: message };
  }
}

/**
 * Per-connection preview + health probe. One bounded-concurrency
 * `ListObjectsV2` doubles as the bucket-card preview and the connection
 * health check; `CorsLikelyError` becomes a card-level CORS warning.
 */
export async function enrichConnectionsWithPreviews({
  request,
  serverLoader,
}: ClientLoaderFunctionArgs): Promise<LoaderData> {
  const server = await serverLoader<typeof loadConnections>();
  const signal = request.signal;

  const probes = await mapWithConcurrency(
    server.connectionConfigs,
    PREVIEW_CONCURRENCY,
    async (config): Promise<ConnectionProbeResult> => {
      if (signal.aborted) return { status: "connected" };
      const creds = server.credentials[config.name];
      if (!creds) {
        return { status: "error", errorMessage: "No credentials available for this connection." };
      }
      return probeConnection(config, creds, signal);
    },
  );

  const nodes: TreeNode[] = server.nodes.map((node, i) => {
    const probe = probes[i];
    return {
      ...node,
      ...(probe.previewObj ? { _Object: probe.previewObj } : {}),
      connectionStatus: probe.status,
      ...(probe.errorMessage ? { connectionErrorMessage: probe.errorMessage } : {}),
    };
  });

  return { ...server, nodes };
}

enrichConnectionsWithPreviews.hydrate = true;
