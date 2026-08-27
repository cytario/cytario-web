import { type TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { getName } from "~/utils/pathUtils";

/** Builds the `TreeNode` for the directory or bucket root currently being browsed. */
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
