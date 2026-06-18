import type { TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { parseResourceId } from "~/utils/resourceId";

/** The connection-root (bucket-level) node for a connection. */
function buildConnectionNode(connectionName: string): TreeNode {
  return {
    id: `${connectionName}/`,
    connectionName,
    name: connectionName,
    type: "bucket",
    pathName: "",
    children: [],
  };
}

/** A directory node at an arbitrary path within a connection. */
function buildDirectoryNode(connectionName: string, pathName: string, name: string): TreeNode {
  return {
    id: `${connectionName}/${pathName}`,
    connectionName,
    name,
    type: "directory",
    pathName,
    children: [],
  };
}

/**
 * Expand a route's current node into its breadcrumb trail. Static nodes (no
 * `connectionName`) are a single crumb; connection nodes split into
 * bucket → directory ancestors → leaf, the passed node reused as the leaf.
 */
export function nodeToTrail(node: TreeNode): TreeNode[] {
  if (!node.connectionName) return [node];

  const { connectionName, pathName } = parseResourceId(node.id);
  const segments = pathName.split("/").filter(Boolean);

  if (segments.length === 0) return [node];

  const trail: TreeNode[] = [buildConnectionNode(connectionName)];

  let acc = "";
  segments.forEach((segment, index) => {
    acc = acc ? `${acc}/${segment}` : segment;
    const isLeaf = index === segments.length - 1;
    trail.push(isLeaf ? node : buildDirectoryNode(connectionName, acc, segment));
  });

  return trail;
}
