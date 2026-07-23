import { NodeIcon } from "./NodeIcon";
import { NodeStatusDot } from "./NodeStatusDot";
import { type TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { select } from "~/utils/connectionsStore/selectors";
import { useConnectionsStore } from "~/utils/connectionsStore/useConnectionsStore";

export const NodeIndicator = ({ node }: { node: TreeNode }) => {
  // Connection health is owned by the store, so every surface that renders a
  // bucket node (list, header search, sidebar) shows the same live status.
  const status = useConnectionsStore(select.connectionStatus(node.connectionId));
  const statusMessage = useConnectionsStore(select.connectionStatusMessage(node.connectionId));

  return (
    <div className="flex items-center justify-center w-6 h-6">
      {node.type === "bucket" ? (
        <NodeStatusDot status={status} errorMessage={statusMessage} />
      ) : (
        <NodeIcon node={node} />
      )}
    </div>
  );
};
