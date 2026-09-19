import { type TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { getName } from "~/utils/pathUtils";

export function buildCurrentNode(
  connectionId: string,
  connectionName: string,
  urlPath: string,
  children: TreeNode[] = [],
): TreeNode {
  const displayName = urlPath ? getName(urlPath, connectionName) : connectionName;
  return {
    id: `${connectionId}/${urlPath}`,
    connectionId,
    connectionName,
    pathName: urlPath,
    name: displayName,
    type: urlPath ? "directory" : "bucket",
    children,
  };
}
