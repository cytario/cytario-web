import { createElement } from "react";
import { twMerge } from "tailwind-merge";

import { type TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { getNodeIcon } from "~/utils/fileType";

interface NodeIconProps {
  node: TreeNode;
  size?: number;
  className?: string;
}

/**
 * Resolves the node's file-type icon and renders it via `createElement` to
 * sidestep the `react-hooks/static-components` lint rule (which flags JSX
 * usage of a component returned from a non-hook function call).
 */
export function NodeIcon({ node, size = 16, className }: NodeIconProps) {
  return createElement(getNodeIcon(node), {
    size,
    strokeWidth: 1.5,
    className: twMerge("shrink-0 text-(--color-text-secondary)", className),
    "aria-hidden": true,
  });
}
