import { MenuItem, MenuSeparator } from "@cytario/design";

import { type TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { buildConnectionPath } from "~/utils/resourceId";

export function NavigationMenuItems({ node, isCurrent }: { node: TreeNode; isCurrent: boolean }) {
  const to = buildConnectionPath(node.connectionId, node.pathName);

  return (
    <>
      {!isCurrent && (
        <MenuItem id="open" icon="ArrowRight" href={to}>
          Open
        </MenuItem>
      )}
      <MenuItem id="open-new-tab" icon="ExternalLink" href={to} target="_blank">
        Open in new tab
      </MenuItem>
      <MenuSeparator />
    </>
  );
}
