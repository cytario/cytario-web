import { Button, EmptyState } from "@cytario/design";
import { FileSearch, Plug } from "lucide-react";
import { type MetaFunction, type ShouldRevalidateFunction, useLoaderData } from "react-router";

import type { LoaderData } from "./connections.loader";
import { Section } from "~/components/Container";
import { DirectoryView } from "~/components/DirectoryView/DirectoryView";
import { ShowFiltersToggle } from "~/components/DirectoryView/ShowFiltersToggle";
import { useLayoutStore } from "~/components/DirectoryView/useLayoutStore";
import { ViewModeToggle } from "~/components/DirectoryView/ViewModeToggle";
import { useModal } from "~/hooks/useModal";

export { enrichConnectionsWithPreviews as clientLoader } from "./connections.clientLoader";
export { loadConnections as loader } from "./connections.loader";

// Response carries STS credentials — keep it out of every cache between origin
// and browser.
export const headers = () => ({ "Cache-Control": "no-store, private" });

const title = "Storage Connections";

export const meta: MetaFunction = () => [{ title: `${title} — Cytario` }];

// The client loader runs an expensive per-bucket probe, so we don't want to
// re-run it on incidental same-path navigations (opening the add-connection
// modal, changing the search query). But we MUST revalidate after a mutation
// and when the user (re-)enters the list — otherwise a connection created on
// another route never appears until a hard reload.
export const shouldRevalidate: ShouldRevalidateFunction = ({
  currentUrl,
  nextUrl,
  formAction,
  defaultShouldRevalidate,
}) => {
  if (formAction) return defaultShouldRevalidate;
  if (currentUrl.pathname !== nextUrl.pathname) return true;
  return false;
};

export default function ConnectionsListRoute() {
  const viewMode = useLayoutStore((state) => state.viewMode);
  const { nodes } = useLoaderData<LoaderData>();

  const { openModal } = useModal();

  if (nodes.length === 0) {
    return (
      <Section>
        <EmptyState
          icon={FileSearch}
          title="No storage connections"
          description="Add a storage connection to view your cloud storage."
          action={
            <Button size="lg" variant="neutral" onPress={() => openModal("add-connection")}>
              Connect Storage
            </Button>
          }
        />
      </Section>
    );
  }

  return (
    <DirectoryView
      kind="connections"
      viewMode={viewMode}
      nodes={nodes}
      name={title}
      secondaryActions={
        <>
          <ShowFiltersToggle />
          <ViewModeToggle />
        </>
      }
    >
      <Button variant="secondary" onPress={() => openModal("add-connection")}>
        <Plug size={16} /> Connect Storage
      </Button>
    </DirectoryView>
  );
}
