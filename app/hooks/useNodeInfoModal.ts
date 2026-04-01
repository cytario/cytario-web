import { useCallback } from "react";

import { type TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { useModal } from "~/hooks/useModal";

/**
 * Returns a callback that opens the appropriate info modal for a file or directory node.
 * Bucket nodes use `ConnectionMenu` instead — this hook is only for files/directories.
 */
export function useNodeInfoModal(node: TreeNode) {
  const { openModal } = useModal();

  return useCallback(() => {
    const nodeName = node.pathName ?? node.name;
    openModal(node.type === "file" ? "file-info" : "directory-info", {
      nodeName,
    });
  }, [node.type, node.pathName, node.name, openModal]);
}
