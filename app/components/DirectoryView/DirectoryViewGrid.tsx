import { twMerge } from "tailwind-merge";

import { TreeNode } from "./buildDirectoryTree";
import { NodeLink } from "./NodeLink/NodeLink";
import { type ViewMode } from "./useLayoutStore";

const gridSizeClasses: Record<ViewMode, string> = {
  list: "",
  "list-wide": "",
  "grid-sm":
    "w-6/12 @[640px]:w-4/12 @[768px]:w-3/12 @[1024px]:w-2/12 @[1536px]:w-1/12",
  "grid-md":
    "w-6/12 @[768px]:w-4/12 @[1024px]:w-3/12 @[1536px]:w-2/12",
  "grid-lg":
    "w-6/12 @[1024px]:w-4/12 @[1536px]:w-3/12",
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
    <div className="@container">
      <div className="flex flex-wrap -m-2">
        {nodes.map((node) => {
          const key = `${node.provider}/${node.bucketName}/${node.pathName ?? node.name}`;
          return (
            <div key={key} className={cx}>
              <NodeLink node={node} viewMode={viewMode} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
