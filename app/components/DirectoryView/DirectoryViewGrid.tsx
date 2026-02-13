import { twMerge } from "tailwind-merge";

import { TreeNode } from "./buildDirectoryTree";
import { NodeLink } from "./NodeLink/NodeLink";
import { type ViewMode } from "./useDirectoryStore";

const gridSizeClasses: Record<ViewMode, string> = {
  list: "",
  "grid-sm": "w-6/12 sm:w-4/12 md:w-3/12 lg:w-2/12 xl:w-2/12 2xl:w-1/12",
  "grid-md": "w-6/12 sm:w-6/12 md:w-4/12 lg:w-3/12 xl:w-3/12 2xl:w-2/12",
  "grid-lg": "w-6/12 sm:w-6/12 md:w-6/12 lg:w-4/12 xl:w-4/12 2xl:w-3/12",
};

export function DirectoryViewGrid({
  nodes,
  viewMode = "grid-sm",
}: {
  nodes: TreeNode[];
  viewMode?: ViewMode;
}) {
  const cx = twMerge(
    "flex flex-col p-2 aspect-square",
    gridSizeClasses[viewMode],
  );

  return (
    <div className="flex flex-wrap -m-2">
      {nodes.map((node) => (
        <div key={node.name} className={cx}>
          <NodeLink key={node.name} node={node} viewMode={viewMode} />
        </div>
      ))}
    </div>
  );
}
