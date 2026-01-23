import { TreeNode } from "./buildDirectoryTree";
import { NodeLink } from "./NodeLink/NodeLink";

export default function DirectoryTree({
  nodes,
  action,
  className,
}: {
  nodes: TreeNode[];
  action?: (node: TreeNode) => void;
  className?: string;
}) {
  return (
    <ul className="pl-4">
      {nodes.map((node) => (
        <li key={node.name}>
          <NodeLink node={node} onClick={action} className={className} />

          {node.children && node.children.length > 0 && (
            <DirectoryTree
              nodes={node.children}
              action={action}
              className={className}
            />
          )}
        </li>
      ))}
    </ul>
  );
}
