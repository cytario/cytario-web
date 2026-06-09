import { useMemo } from "react";

import { type TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { DirectoryViewTree } from "~/components/DirectoryView/DirectoryViewTree";
import { onExpand } from "~/components/DirectoryView/onExpand";

interface ConnectionTreeProps {
  selectedConnection: string;
}

export function ConnectionTree({ selectedConnection }: ConnectionTreeProps) {
  const rootId = `${selectedConnection}/`;

  const rootNodes = useMemo<TreeNode[]>(
    () => [
      {
        id: rootId,
        connectionName: selectedConnection,
        type: "bucket", // NodeIndicator only shows the status dot for buckets
        name: selectedConnection,
        pathName: "",
        children: [],
        hasChildren: true,
        isLeaf: false,
        loadState: "idle",
      },
    ],
    [rootId, selectedConnection],
  );

  return (
    <DirectoryViewTree
      // Remount on connection change to reset headless-tree's id cache.
      key={selectedConnection}
      nodes={rootNodes}
      kind="entries"
      onExpand={onExpand}
      defaultExpandedItems={[rootId]}
    />
  );
}
