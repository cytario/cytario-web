import { NodeIcon } from "./NodeIcon";
import { NodeStatusDot } from "./NodeStatusDot";
import { type TreeNode } from "~/components/DirectoryView/buildDirectoryTree";

export const NodeIndicator = ({ node }: { node: TreeNode }) => {
  return (
    <div className="flex items-center justify-center w-6 h-6">
      {node.type === "bucket" ? (
        <NodeStatusDot
          status={node.connectionStatus ?? "loading"}
          errorMessage={node.connectionErrorMessage}
        />
      ) : (
        <NodeIcon node={node} />
      )}
    </div>
  );
};
