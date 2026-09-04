import { MenuItem } from "@cytario/design";

import { type TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { useFavorite } from "~/routes/favorites/useFavorite";

export function FavoriteMenuItem({ node }: { node: TreeNode }) {
  const { isFavorite, isPending, toggle } = useFavorite(node);

  return (
    <MenuItem
      id="favorite"
      icon={isFavorite ? "BookmarkCheck" : "Bookmark"}
      isDisabled={isPending}
      onAction={toggle}
    >
      {isFavorite ? "Remove Favorite" : "Add Favorite"}
    </MenuItem>
  );
}
