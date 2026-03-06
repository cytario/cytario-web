import { icons } from "lucide-react";

import { TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { getFileTypeIcon } from "~/utils/fileType";

export function NodeLinkIcon({ node }: { node: TreeNode }) {
  const iconName = node.type === "file" ? getFileTypeIcon(node.name) : "Folder";
  const resolvedName = node.type === "bucket" ? "Archive" : iconName;
  const IconComponent = icons[resolvedName] ?? icons["File"];

  return (
    <div className="flex items-center justify-center">
      <IconComponent strokeWidth={1.5} size={24} />
    </div>
  );
}
