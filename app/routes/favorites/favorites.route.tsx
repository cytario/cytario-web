import { EmptyState, H2 } from "@cytario/design";
import { Star } from "lucide-react";
import { useMemo } from "react";
import {
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  type MetaFunction,
  useLoaderData,
} from "react-router";

import { addFavoriteAction } from "./addFavorite.action";
import { loadFavorites } from "./favorites.loader";
import { removeFavoriteAction } from "./removeFavorite.action";
import { authContext } from "~/.server/auth/authMiddleware";
import { Container, Section } from "~/components/Container";
import { TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { DirectoryView } from "~/components/DirectoryView/DirectoryView";
import { ShowFiltersToggle } from "~/components/DirectoryView/ShowFiltersToggle";
import { useLayoutStore } from "~/components/DirectoryView/useLayoutStore";
import { ViewModeToggle } from "~/components/DirectoryView/ViewModeToggle";
import { favoriteToNode, filterByKnownConnection } from "~/utils/dashboardNodes";

export const meta: MetaFunction = () => [{ title: "Favorites — Cytario" }];

export const handle = {
  breadcrumb: () => ({ label: "Favorites", to: "/favorites" }),
};

export const action = async (args: ActionFunctionArgs) => {
  switch (args.request.method.toUpperCase()) {
    case "PUT":
      return addFavoriteAction(args);
    case "DELETE":
      return removeFavoriteAction(args);
    default:
      return new Response("Method not allowed", { status: 405 });
  }
};

export const loader = async ({ context }: LoaderFunctionArgs) => {
  const { user, connectionConfigs } = context.get(authContext);
  return {
    connectionConfigs,
    favorites: await loadFavorites(user.sub),
  };
};

export default function FavoritesRoute() {
  const { connectionConfigs, favorites } = useLoaderData<typeof loader>();
  const viewMode = useLayoutStore((s) => s.viewMode);

  const allItems: TreeNode[] = useMemo(
    () => filterByKnownConnection(favorites, connectionConfigs).map(favoriteToNode),
    [favorites, connectionConfigs],
  );

  if (allItems.length === 0) {
    return (
      <Section>
        <Container>
          <header className="flex flex-wrap items-center gap-2 mb-8">
            <H2 className="grow">Favorites</H2>
          </header>
        </Container>
        <EmptyState
          icon={Star}
          title="No favorites"
          description="Directories you favorite will appear here."
        />
      </Section>
    );
  }

  return (
    <DirectoryView
      kind="entries"
      viewMode={viewMode}
      nodes={allItems}
      name="Favorites"
      secondaryActions={
        <>
          <ShowFiltersToggle />
          <ViewModeToggle />
        </>
      }
    />
  );
}
