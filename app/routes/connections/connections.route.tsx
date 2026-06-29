import { Button, EmptyState, Icon } from "@cytario/design";
import { type MetaFunction, type ShouldRevalidateFunction, useLoaderData } from "react-router";

import type { LoaderData } from "./connections.loader";
import { Section } from "~/components/Container";
import { DirectoryView } from "~/components/DirectoryView/DirectoryView";
import { ShowFiltersToggle } from "~/components/DirectoryView/ShowFiltersToggle";
import { ViewModeToggle } from "~/components/DirectoryView/ViewModeToggle";
import { useModal } from "~/hooks/useModal";
import { buildVirtualNode } from "~/utils/treeNodeFactories";

export { enrichConnectionsWithPreviews as clientLoader } from "./connections.clientLoader";
export { loadConnections as loader } from "./connections.loader";

// Response carries STS credentials — keep it out of every cache between origin
// and browser.
export const headers = () => ({ "Cache-Control": "no-store, private" });

const title = "Connections";

export const meta: MetaFunction = () => [{ title: `${title} — Cytario` }];

export const shouldRevalidate: ShouldRevalidateFunction = ({
  formAction,
  defaultShouldRevalidate,
}) => {
  if (formAction) return defaultShouldRevalidate;
  return false;
};

export default function ConnectionsListRoute() {
  const { nodes } = useLoaderData<LoaderData>();

  const { openModal } = useModal();

  if (nodes.length === 0) {
    return (
      <Section>
        <EmptyState
          icon="FileSearch"
          title="No connections"
          description="Add a connection to view your cloud storage."
          action={
            <Button size="lg" variant="secondary" onPress={() => openModal("add-connection")}>
              <Icon icon="Plug" size="lg" /> Add Connection
            </Button>
          }
        />
      </Section>
    );
  }

  return (
    <DirectoryView kind="connections" node={buildVirtualNode(title, nodes)}>
      <Button size="sm" variant="secondary" onPress={() => openModal("add-connection")}>
        <Icon icon="Plug" size="sm" /> Add Connection
      </Button>
      <ShowFiltersToggle />
      <ViewModeToggle />
    </DirectoryView>
  );
}
