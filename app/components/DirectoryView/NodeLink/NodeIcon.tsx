import { Icon, type IconName } from "@cytario/design";

import { type TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { allFileTypes, stripUrlSuffix } from "~/utils/fileType";

interface NodeIconProps {
  node: TreeNode;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
}

/**
 * Resolves the icon name for a TreeNode: `bucket` → Archive, `directory` →
 * Folder, file → its matching file-type icon (fallback File).
 */
export function getNodeIcon(node: { type: string; name: string }): IconName {
  if (node.type === "bucket") return "Archive";
  if (node.type === "directory") return "Folder";
  const cleaned = stripUrlSuffix(node.name);
  for (const entry of allFileTypes()) {
    if (entry.pattern.test(cleaned)) return entry.icon;
  }
  return "File";
}

export function NodeIcon({ node, size = "sm", className }: NodeIconProps) {
  return <Icon icon={getNodeIcon(node)} size={size} strokeWidth={1.5} className={className} />;
}
