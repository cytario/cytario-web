import { _Object } from "@aws-sdk/client-s3";
import { H1 } from "@cytario/design";
import { useEffect } from "react";
import { type ClientLoaderFunctionArgs, useLoaderData } from "react-router";

import type { ConnectionConfig } from "~/.generated/client";
import { Section } from "~/components/Container";
import { buildDirectoryTree, TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { DirectoryTree } from "~/components/DirectoryView/DirectoryViewTree";
import { type NotificationInput } from "~/components/Notification/Notification.store";
import { toastBridge, toToastVariant } from "~/toast-bridge";
import { useConnectionsStore } from "~/utils/connectionsStore/useConnectionsStore";
import { mapWithConcurrency } from "~/utils/limitConcurrency";
import { listObjectsClient } from "~/utils/listObjectsClient";
import { getPrefix } from "~/utils/pathUtils";
import { CorsLikelyError } from "~/utils/signedFetch";

const SEARCH_CONCURRENCY = 6;

interface ConfigFiles {
  config: ConnectionConfig;
  files: _Object[];
  prefix?: string;
}

export interface SearchRouteLoaderResponse {
  searchQuery: string;
  nodes: TreeNode[];
  notification?: NotificationInput;
}

export const handle = {
  breadcrumb: () => ({ label: "Search", to: "/search" }),
};

// Client-only loader — credentials already live in `ConnectionsStore`, so a
// server loader would only re-ship STS material. Auth still runs via the
// parent `protected.layout`.
export const clientLoader = async ({
  request,
}: ClientLoaderFunctionArgs): Promise<SearchRouteLoaderResponse> => {
  const url = new URL(request.url);
  const searchQuery = url.searchParams.get("query") ?? "";
  const suffix = url.searchParams.get("suffix");
  const keyFilter = suffix
    ? (() => {
        const needle = `.${suffix.toLowerCase()}`;
        return (key: string) => key.toLowerCase().endsWith(needle);
      })()
    : undefined;
  const connections = useConnectionsStore.getState().connections;
  const signal = request.signal;

  const perConnection = await mapWithConcurrency(
    Object.values(connections),
    SEARCH_CONCURRENCY,
    async ({ connectionConfig: config, credentials }) => {
      const prefix = getPrefix(config.prefix);
      try {
        const { contents, isCapped } = await listObjectsClient(config, credentials, {
          query: keyFilter ? null : searchQuery,
          keyFilter,
          prefix,
          recursive: true,
          signal,
        });
        return {
          config,
          files: contents,
          prefix,
          isCapped,
          error: false,
          corsBlocked: false,
        };
      } catch (error) {
        console.error(`Search failed for connection "${config.name}":`, error);
        return {
          config,
          files: [] as _Object[],
          prefix,
          isCapped: false,
          error: true,
          corsBlocked: error instanceof CorsLikelyError,
        };
      }
    },
  );

  const results: ConfigFiles[] = perConnection
    .filter((r) => r.files.length > 0)
    .map(({ config, files, prefix }) => ({ config, files, prefix }));

  const cappedConnections = perConnection.filter((r) => r.isCapped).map((r) => r.config.name);
  const failedConnections = perConnection
    .filter((r) => r.error && !r.corsBlocked)
    .map((r) => r.config.name);
  const corsBlockedConnections = perConnection
    .filter((r) => r.corsBlocked)
    .map((r) => r.config.name);

  const nodes: TreeNode[] = results.map(({ config, files, prefix }) => ({
    id: `${config.name}/`,
    connectionName: config.name,
    name: config.name,
    type: "bucket" as const,
    pathName: "",
    children: buildDirectoryTree(files as _Object[], config.name, prefix ?? ""),
  }));

  const notification = buildSearchNotification(
    cappedConnections,
    failedConnections,
    corsBlockedConnections,
  );

  return { searchQuery, nodes, notification };
};

function quoteJoin(names: readonly string[]): string {
  return names.map((n) => `"${n}"`).join(", ");
}

function buildSearchNotification(
  cappedConnections: readonly string[],
  failedConnections: readonly string[],
  corsBlockedConnections: readonly string[],
): NotificationInput | undefined {
  const hasCapped = cappedConnections.length > 0;
  const hasFailed = failedConnections.length > 0;
  const hasCors = corsBlockedConnections.length > 0;

  if (!hasCapped && !hasFailed && !hasCors) return undefined;

  if (hasCors) {
    const parts: string[] = [
      `Browser was blocked from reading ${quoteJoin(corsBlockedConnections)} — likely a CORS misconfiguration on the bucket. Re-check the bucket's CORS policy or contact your administrator.`,
    ];
    if (hasFailed) {
      parts.push(`Search also failed for ${quoteJoin(failedConnections)}.`);
    }
    if (hasCapped) {
      parts.push(
        `Results were truncated for ${quoteJoin(cappedConnections)} — refine your query to see more matches.`,
      );
    }
    return { status: "error", message: parts.join(" ") };
  }

  if (hasCapped && hasFailed) {
    return {
      status: "error",
      message:
        `Search failed for ${quoteJoin(failedConnections)}. ` +
        `Results were also truncated for ${quoteJoin(cappedConnections)} — refine your query to see more matches.`,
    };
  }

  if (hasFailed) {
    return {
      status: "error",
      message: `Search failed for ${quoteJoin(failedConnections)} — check your connection or try again.`,
    };
  }

  return {
    status: "warning",
    message: `Search results were truncated for ${quoteJoin(cappedConnections)} — refine your query to see more matches.`,
  };
}

clientLoader.hydrate = true;

export default function SearchRoute() {
  const { searchQuery, nodes, notification } = useLoaderData<typeof clientLoader>();

  useEffect(() => {
    if (notification) {
      toastBridge.emit({
        variant: toToastVariant(notification.status ?? "info"),
        message: notification.message,
      });
    }
  }, [notification]);

  return (
    <Section>
      <H1>{`Search: ${searchQuery}`}</H1>

      <div className="bg-slate-100">
        <DirectoryTree nodes={nodes} />
      </div>
    </Section>
  );
}
