import { IconButton } from "@cytario/design";
import { EllipsisVertical } from "lucide-react";

import { type TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { ConnectionMenu } from "~/components/DirectoryView/ConnectionMenu";
import { useNodeInfoModal } from "~/hooks/useNodeInfoModal";

export const NodeContextMenu = ({ node }: { node: TreeNode }) => {
  const openInfo = useNodeInfoModal(node);

  if (node.type === "bucket") {
    return <ConnectionMenu connectionName={node.name} />;
  }

  return (
    <IconButton
      icon={EllipsisVertical}
      aria-label={`Show info for ${node.name}`}
      onPress={openInfo}
      variant="ghost"
      size="sm"
    />
  );
};
