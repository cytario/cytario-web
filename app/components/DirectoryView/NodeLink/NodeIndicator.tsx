import { ConnectionStatusIndicator } from "../ConnectionStatusIndicator";
import { NodeIcon } from "./NodeIcon";
import { type TreeNode } from "~/components/DirectoryView/buildDirectoryTree";

export const NodeIndicator = ({ node }: { node: TreeNode }) => (
  <div className="flex items-center justify-center m-1">
    {node.type === "bucket" ? (
      <ConnectionStatusIndicator connectionId={node.connectionId} />
    ) : (
      <NodeIcon node={node} />
    )}
  </div>
);
