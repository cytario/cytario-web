import type { ToastData } from "@cytario/design";

import { type TreeNode } from "./buildDirectoryTree";
import { select } from "~/utils/connectionsStore/selectors";
import { useConnectionsStore } from "~/utils/connectionsStore/useConnectionsStore";
import { formatTruncationMessage } from "~/utils/listingLimits";
import { loadConnectionLevel } from "~/utils/loadConnectionLevel";

export async function onExpand(
  parent: TreeNode,
  showToast?: (toast: Omit<ToastData, "id">) => void,
): Promise<TreeNode[]> {
  if (parent.isLeaf || parent.type === "file") return [];

  const conn = select.connection(parent.connectionId)(useConnectionsStore.getState());
  if (!conn?.credentials) return [];

  const { nodes, isCapped } = await loadConnectionLevel({
    connectionConfig: conn.connectionConfig,
    credentials: conn.credentials,
    connectionId: parent.connectionId,
    connectionName: parent.connectionName,
    provider: conn.provider,
    urlPath: parent.pathName,
  });

  if (isCapped) {
    showToast?.({ variant: "info", message: formatTruncationMessage(parent.name) });
  }
  return nodes;
}
