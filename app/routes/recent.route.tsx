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

import { authContext } from "~/.server/auth/authMiddleware";
import { Container, Section } from "~/components/Container";
import { TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { DirectoryView } from "~/components/DirectoryView/DirectoryView";
import { ShowFiltersToggle } from "~/components/DirectoryView/ShowFiltersToggle";
import { useLayoutStore } from "~/components/DirectoryView/useLayoutStore";
import { ViewModeToggle } from "~/components/DirectoryView/ViewModeToggle";
import { clearAllRecentlyViewed, getRecentlyViewed } from "~/utils/recentlyViewed.server";

export const meta: MetaFunction = () => [{ title: "Recent — Cytario" }];

export const handle = {
  breadcrumb: () => ({ label: "Recent", to: "/recent" }),
};

export const action = async ({ request, context }: ActionFunctionArgs) => {
  const { user } = context.get(authContext);
  if (request.method.toUpperCase() === "DELETE") {
    await clearAllRecentlyViewed(user.sub);
    return { ok: true };
  }
  return null;
};

export const loader = async ({ context }: LoaderFunctionArgs) => {
  const { user, connectionConfigs } = context.get(authContext);
  const raw = await getRecentlyViewed(user.sub, 50);
  return {
    connectionConfigs,
    recentlyViewed: raw.map((item) => ({
      id: item.id,
      connectionName: item.connectionName,
      pathName: item.pathName,
      name: item.name,
      type: item.type,
      viewedAt: item.viewedAt.toISOString(),
    })),
  };
};

export default function RecentRoute() {
  const { connectionConfigs, recentlyViewed } = useLoaderData<typeof loader>();
  const viewMode = useLayoutStore((s) => s.viewMode);
  const clearFetcher = useFetcher();

  const configByName = useMemo(() => {
    const map = new Map<string, (typeof connectionConfigs)[number]>();
    for (const c of connectionConfigs) map.set(c.name, c);
    return map;
  }, [connectionConfigs]);

  const allItems: TreeNode[] = useMemo(
    () =>
      recentlyViewed
        .filter((item) => configByName.has(item.connectionName))
        .map((item) => ({
          id: `${item.connectionName}/${item.pathName}`,
          connectionName: item.connectionName,
          pathName: item.pathName,
          name: item.name,
          type: item.type as TreeNode["type"],
          children: [],
        })),
    [recentlyViewed, configByName],
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
        onPress={() => clearFetcher.submit({}, { method: "delete" })}
      >
        <Trash2 size={16} />
        Clear history
      </Button>
    </DirectoryView>
  );
}
