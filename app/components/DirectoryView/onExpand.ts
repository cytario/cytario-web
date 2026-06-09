import { type TreeNode } from "./buildDirectoryTree";
import { toastBridge, toToastVariant } from "~/toast-bridge";
import { select } from "~/utils/connectionsStore/selectors";
import { useConnectionsStore } from "~/utils/connectionsStore/useConnectionsStore";
import { formatTruncationMessage } from "~/utils/listingLimits";
import { loadConnectionLevel } from "~/utils/loadConnectionLevel";

/**
 * Fetches one S3 level for the parent's connection. Emits a truncation toast
 * if the listing is capped. Suitable as the `onExpand` prop on
 * `DirectoryViewTree`.
 */
export async function onExpand(parent: TreeNode): Promise<TreeNode[]> {
  if (parent.isLeaf || parent.type === "file") return [];

  const conn = select.connection(parent.connectionName)(useConnectionsStore.getState());
  // No entry, or a broken connection with no usable credentials — nothing to fetch.
  if (!conn?.credentials) return [];

  const { nodes, isCapped } = await loadConnectionLevel({
    connectionConfig: conn.connectionConfig,
    credentials: conn.credentials,
    connectionName: parent.connectionName,
    urlPath: parent.pathName,
  });

  if (isCapped) {
    toastBridge.emit({
      variant: toToastVariant("warning"),
      message: formatTruncationMessage(parent.name),
    });
  }
  return nodes;
}
