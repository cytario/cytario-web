import { Archive, File, type LucideIcon, Slash } from "lucide-react";

import { TreeNode } from "~/components/DirectoryView/buildDirectoryTree";

const icons: Record<string, LucideIcon> = {
  directory: Slash,
  file: File,
  bucket: Archive,
};

export function NodeLinkIcon({ node }: { node: TreeNode }) {
  const IconComponent = icons[node.type];

  return (
    <div className={"flex items-center justify-center"}>
      {IconComponent && <IconComponent strokeWidth={1.5} size={24} />}
    </div>
  );
}
