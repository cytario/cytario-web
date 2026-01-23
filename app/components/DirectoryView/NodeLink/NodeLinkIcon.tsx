import { Icon, LucideIconsType } from "~/components/Controls/IconButton";
import { TreeNode } from "~/components/DirectoryView/buildDirectoryTree";

const icons: Record<string, LucideIconsType> = {
  directory: "Folder",
  file: "File",
  bucket: "Archive",
};

export function NodeLinkIcon({ node }: { node: TreeNode }) {
  return (
    <div className={"flex items-center justify-center"}>
      <Icon icon={icons[node.type]} />
    </div>
  );
}
