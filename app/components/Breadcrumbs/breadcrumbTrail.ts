import type { TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { parseResourceId } from "~/utils/resourceId";

export interface OrgCrumb {
  /** The organization whose entries the switcher offers. */
  alias: string;
  /** `true` for the session's active organization. */
  isActive: boolean;
}

/**
 * The breadcrumb root: every organization the user belongs to, active first, so
 * the switcher lists the current org at the top without a second lookup.
 */
export function buildOrgCrumbs(
  organizations: readonly string[],
  activeOrganization: string | undefined,
): OrgCrumb[] {
  const aliases = [
    ...new Set(activeOrganization ? [activeOrganization, ...organizations] : organizations),
  ];
  return aliases.map((alias) => ({ alias, isActive: alias === activeOrganization }));
}

function buildConnectionNode(connectionId: string, connectionName: string): TreeNode {
  return {
    id: `${connectionId}/`,
    connectionId,
    connectionName,
    name: connectionName,
    type: "bucket",
    pathName: "",
    children: [],
  };
}

function buildDirectoryNode(
  connectionId: string,
  connectionName: string,
  pathName: string,
  name: string,
): TreeNode {
  return {
    id: `${connectionId}/${pathName}`,
    connectionId,
    connectionName,
    name,
    type: "directory",
    pathName,
    children: [],
  };
}

export function nodeToTrail(node: TreeNode): TreeNode[] {
  if (!node.connectionId) return [node];

  const { connectionId, pathName } = parseResourceId(node.id);
  const segments = pathName.split("/").filter(Boolean);

  if (segments.length === 0) return [node];

  const trail: TreeNode[] = [buildConnectionNode(connectionId, node.connectionName)];

  let acc = "";
  segments.forEach((segment, index) => {
    acc = acc ? `${acc}/${segment}` : segment;
    const isLeaf = index === segments.length - 1;
    trail.push(
      isLeaf ? node : buildDirectoryNode(connectionId, node.connectionName, `${acc}/`, segment),
    );
  });

  return trail;
}
