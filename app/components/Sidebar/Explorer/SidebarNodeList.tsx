import type { TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { NodeLink } from "~/components/DirectoryView/NodeLink/NodeLink";

export function SidebarNodeList({ nodes }: { nodes: TreeNode[] }) {
  return (
    <div className="flex flex-col px-2 py-2">
      {nodes.map((node) => (
        <NodeLink key={node.id} node={node} />
      ))}
    </div>
  );
}
