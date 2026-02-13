import { TreeNode } from "./buildDirectoryTree";
import { NodeLink } from "./NodeLink/NodeLink";

export function DirectoryViewGrid({ nodes }: { nodes: TreeNode[] }) {
  return (
    <div className="flex flex-wrap -m-2">
      {nodes.map((node) => (
        <div
          key={node.name}
          className={`
            flex flex-col p-2
            w-full sm:w-6/12 md:w-4/12 lg:w-3/12 xl:w-2/12
            aspect-square
          `}
        >
          <NodeLink key={node.name} node={node} listStyle="grid" />
        </div>
      ))}
    </div>
  );
}
