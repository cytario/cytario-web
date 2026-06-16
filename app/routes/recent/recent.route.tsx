import { Button, EmptyState, H2 } from "@cytario/design";
import { Clock, Trash2 } from "lucide-react";
import { useMemo } from "react";
import {
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  type MetaFunction,
  useFetcher,
  useLoaderData,
} from "react-router";

import { clearRecentlyViewed } from "./clearRecentlyViewed.action";
import { loadRecentlyViewed } from "./recent.loader";
import { recordRecentlyViewed } from "./recordRecentlyViewed.action";
import { authContext } from "~/.server/auth/authMiddleware";
import { Container, Section } from "~/components/Container";
import { TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { DirectoryView } from "~/components/DirectoryView/DirectoryView";
import { ShowFiltersToggle } from "~/components/DirectoryView/ShowFiltersToggle";
import { useLayoutStore } from "~/components/DirectoryView/useLayoutStore";
import { ViewModeToggle } from "~/components/DirectoryView/ViewModeToggle";
import { filterByKnownConnection, recentToNode } from "~/utils/dashboardNodes";

export const meta: MetaFunction = () => [{ title: "Recent — Cytario" }];

export const handle = {
  breadcrumb: () => ({ label: "Recent", to: "/recent" }),
};

export const action = async (args: ActionFunctionArgs) => {
  switch (args.request.method.toUpperCase()) {
    case "POST":
      return recordRecentlyViewed(args);
    case "DELETE":
      return clearRecentlyViewed(args);
    default:
      return new Response("Method not allowed", { status: 405 });
  }
};

export const loader = async ({ context }: LoaderFunctionArgs) => {
  const { user, connectionConfigs } = context.get(authContext);
  return {
    connectionConfigs,
    recentlyViewed: await loadRecentlyViewed(user.sub, 50),
  };
};

export default function RecentRoute() {
  const { connectionConfigs, recentlyViewed } = useLoaderData<typeof loader>();
  const viewMode = useLayoutStore((s) => s.viewMode);
  const clearFetcher = useFetcher();

  const allItems: TreeNode[] = useMemo(
    () => filterByKnownConnection(recentlyViewed, connectionConfigs).map(recentToNode),
    [recentlyViewed, connectionConfigs],
  );

  if (allItems.length === 0) {
    return (
      <Section>
        <Container>
          <header className="flex flex-wrap items-center gap-2 mb-8">
            <H2 className="grow">Recent</H2>
          </header>
        </Container>
        <EmptyState
          icon={Clock}
          title="No recent items"
          description="Items you view or browse will appear here."
        />
      </Section>
    );
  }

  return (
    <DirectoryView
      kind="entries"
      viewMode={viewMode}
      nodes={allItems}
      name="Recent"
      secondaryActions={
        <>
          <ShowFiltersToggle />
          <ViewModeToggle />
        </>
      }
    >
      <Button
        variant="secondary"
        size="sm"
        onPress={() => clearFetcher.submit({}, { method: "delete" })}
      >
        <Trash2 size={16} />
        Clear history
      </Button>
    </DirectoryView>
  );
}
