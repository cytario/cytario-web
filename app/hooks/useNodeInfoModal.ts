import { useCallback } from "react";

import { type TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { useModal } from "~/hooks/useModal";

/**
 * Returns a callback that opens the appropriate info modal for a node.
 * Centralises the modal-name + search-param logic so call sites stay DRY.
 *
 * Only `nodeName` is stored in the URL — the modal reads full connection
 * data from `useConnectionsStore` at render time.
 */
export function useNodeInfoModal(node: TreeNode) {
  const { openModal } = useModal();

  return useCallback(() => {
    const nodeName = node.pathName ?? node.name;
    if (node.type === "bucket") {
      openModal("connection-info", { nodeName });
    } else {
      openModal(node.type === "file" ? "file-info" : "directory-info", {
        nodeName,
      });
    }
  }, [node.type, node.pathName, node.name, openModal]);
}
