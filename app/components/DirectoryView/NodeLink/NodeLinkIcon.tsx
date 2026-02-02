import { Icon, type LucideIconsType } from "~/components/Controls";
import { TreeNode } from "~/components/DirectoryView/buildDirectoryTree";

const icons: Record<string, LucideIconsType> = {
  directory: "Slash",
  file: "File",
  bucket: "Archive",
};

export function NodeLinkIcon({ node }: { node: TreeNode }) {
  return (
    <div className={"flex items-center justify-center"}>
      <Icon icon={icons[node.type]} strokeWidth={1} />
    </div>
  );
}
