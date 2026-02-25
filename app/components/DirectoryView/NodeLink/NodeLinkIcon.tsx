import { Icon, type LucideIconsType } from "~/components/Controls";
import { TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { getFileTypeIcon } from "~/utils/fileType";

const nodeTypeIcons: Record<string, LucideIconsType> = {
  directory: "Folder",
  bucket: "Archive",
};

export function NodeLinkIcon({ node }: { node: TreeNode }) {
  const icon =
    node.type === "file"
      ? getFileTypeIcon(node.name)
      : (nodeTypeIcons[node.type] ?? "File");

  return (
    <div className="flex items-center justify-center">
      <Icon icon={icon} strokeWidth={1.5} />
    </div>
  );
}
