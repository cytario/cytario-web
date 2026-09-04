import { MenuItem } from "@cytario/design";

import { type TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { useModal } from "~/hooks/useModal";
import { select } from "~/utils/connectionsStore/selectors";
import { useConnectionsStore } from "~/utils/connectionsStore/useConnectionsStore";

export function ShareMenuItem({ node }: { node: TreeNode }) {
  const connection = useConnectionsStore(select.connection(node.connectionId));
  const { openModal } = useModal();

  const isFolder = node.type === "directory" || node.type === "bucket";
  const canShare = isFolder && (connection?.provider?.allowsSharing ?? false);

  if (!canShare) return null;

  return (
    <MenuItem
      id="share"
      icon="Send"
      onAction={() =>
        openModal("share-folder", {
          connectionId: node.connectionId,
          nodePath: node.pathName,
        })
      }
    >
      Share
    </MenuItem>
  );
}
