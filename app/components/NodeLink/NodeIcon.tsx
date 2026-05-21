import { Archive, File, Folder, icons, type LucideIcon } from "lucide-react";
import { createElement } from "react";
import { twMerge } from "tailwind-merge";

import { type TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { getFileTypeIcon } from "~/utils/fileType";

interface NodeIconProps {
  node: TreeNode;
  size?: number;
  className?: string;
}

/**
 * Resolves the Lucide icon component for a TreeNode:
 * - `bucket` → `Archive`
 * - `directory` → `Folder`
 * - file → file-type-specific icon via `getFileTypeIcon`, fallback `File`.
 */
export function getNodeIcon(node: { type: string; name: string }): LucideIcon {
  if (node.type === "bucket") return Archive;
  if (node.type === "directory") return Folder;
  return icons[getFileTypeIcon(node.name)] ?? File;
}

/**
 * Renders the node's icon via `createElement` to sidestep the
 * `react-hooks/static-components` lint rule (which flags JSX usage of a
 * component returned from a non-hook function call).
 */
export function NodeIcon({ node, size = 6, className }: NodeIconProps) {
  return createElement(getNodeIcon(node), {
    size,
    strokeWidth: 1.5,
    className: twMerge("shrink-0", className, "bg-orange-400 w-6 h-6"),
    "aria-hidden": true,
  });
}
