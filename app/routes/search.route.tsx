import { H1 } from "@cytario/design";
import { useEffect, useMemo } from "react";
import { type ClientLoaderFunctionArgs, useLoaderData } from "react-router";

import { Section } from "~/components/Container";
import { collectInteriorIds, type TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { DirectoryViewTree } from "~/components/DirectoryView/DirectoryViewTree";
import { type NotificationInput } from "~/components/Notification/Notification.store";
import { toastBridge, toToastVariant } from "~/toast-bridge";
import { useConnectionsStore } from "~/utils/connectionsStore/useConnectionsStore";
import { mapWithConcurrency } from "~/utils/limitConcurrency";
import { searchConnection } from "~/utils/searchConnection";
import { buildVirtualNode } from "~/utils/treeNodeFactories";

const SEARCH_CONCURRENCY = 6;

export interface SearchRouteLoaderResponse {
  searchQuery: string;
  nodes: TreeNode[];
  notification?: NotificationInput;
}

export const handle = {
  node: () => buildVirtualNode("Search", []),
};

// Client-only loader — credentials already live in `ConnectionsStore`, so a
// server loader would only re-ship STS material. Auth still runs via the
// parent `protected.layout`.
export const clientLoader = async ({
  request,
}: ClientLoaderFunctionArgs): Promise<SearchRouteLoaderResponse> => {
  const searchQuery = new URL(request.url).searchParams.get("query") ?? "";
  const connections = useConnectionsStore.getState().connections;
  const signal = request.signal;

  const perConnection = await mapWithConcurrency(
    Object.values(connections),
    SEARCH_CONCURRENCY,
    (connection) => searchConnection({ connection, query: searchQuery, signal }),
  );

  const cappedConnections = perConnection
    .filter((r) => r.isCapped)
    .map((r) => r.node.connectionName);
  const failedConnections = perConnection
    .filter((r) => r.error && !r.corsBlocked)
    .map((r) => r.node.connectionName);
  const corsBlockedConnections = perConnection
    .filter((r) => r.corsBlocked)
    .map((r) => r.node.connectionName);

  const nodes = perConnection
    .map((r) => r.node)
    .filter((node) => node.children && node.children.length > 0);

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
  const defaultExpandedItems = useMemo(() => collectInteriorIds(nodes), [nodes]);

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

      <div className="bg-muted p-2">
        <DirectoryViewTree
          nodes={nodes}
          kind="entries"
          defaultExpandedItems={defaultExpandedItems}
        />
      </div>
    </Section>
  );
}
