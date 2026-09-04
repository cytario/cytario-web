import { MenuItem } from "@cytario/design";

import { type TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { useModal } from "~/hooks/useModal";

export function CyberduckMenuItem({ node }: { node: TreeNode }) {
  const { openModal } = useModal();

  return (
    <MenuItem
      id="cyberduck"
      icon="Download"
      onAction={() => openModal("cyberduck", { connectionId: node.connectionId })}
    >
      Access with Cyberduck
    </MenuItem>
  );
}
