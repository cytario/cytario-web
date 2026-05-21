import { NodeLink } from "./NodeLink";
import { type TreeNode } from "~/components/DirectoryView/buildDirectoryTree";

interface NodeLinkListProps {
  nodes: TreeNode[];
  /** Optional click override applied to every row (e.g. close a dropdown). */
  onNodeClick?: (node: TreeNode) => void;
  /** Show context menu trigger on rows. Default false (dropdown/search rows). */
  contextMenu?: boolean;
  /** Internal — current nesting depth, used for indent. */
  level?: number;
}

/**
 * Recursive list of `NodeLink` rows preserving the TreeNode hierarchy via
 * indented `<ul>` nesting. Used for non-virtualized contexts (search results,
 * global search dropdown) where the design-system `<Tree>`'s fixed-height
 * virtualization is overkill.
 */
export function NodeLinkList({
  nodes,
  onNodeClick,
  contextMenu = false,
  level = 0,
}: NodeLinkListProps) {
  return (
    <ul className={level === 0 ? "" : "pl-6"}>
      {nodes.map((node) => (
        <li key={node.id}>
          <div className="flex items-center min-h-8">
            <NodeLink node={node} onClick={onNodeClick} contextMenu={contextMenu} />
          </div>
          {node.children && node.children.length > 0 && (
            <NodeLinkList
              nodes={node.children}
              onNodeClick={onNodeClick}
              contextMenu={contextMenu}
              level={level + 1}
            />
          )}
        </li>
      ))}
    </ul>
  );
}
