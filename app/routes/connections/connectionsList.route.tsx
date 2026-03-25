import { Button, EmptyState } from "@cytario/design";
import { FileSearch, Plug } from "lucide-react";
import {
  type LoaderFunctionArgs,
  type MetaFunction,
  type ShouldRevalidateFunction,
  useLoaderData,
} from "react-router";

import { authMiddleware } from "~/.server/auth/authMiddleware";
import { Section } from "~/components/Container";
import { DirectoryView } from "~/components/DirectoryView/DirectoryView";
import { useLayoutStore } from "~/components/DirectoryView/useLayoutStore";
import { ViewModeToggle } from "~/components/DirectoryView/ViewModeToggle";
import { useInitConnections } from "~/hooks/useInitConnections";
import { useModal } from "~/hooks/useModal";
import { loadConnectionNodes } from "~/routes/connections/loadConnectionNodes";

export { addConnectionAction as action } from "./addConnection.action";

const title = "Storage Connections";

export const meta: MetaFunction = () => [{ title: `${title} — Cytario` }];

export const shouldRevalidate: ShouldRevalidateFunction = ({
  formAction,
  defaultShouldRevalidate,
}) => {
  if (formAction) return defaultShouldRevalidate;
  return false;
};

export const handle = {
  breadcrumb: () => ({ label: "Connections", to: "/connections" }),
};

export const middleware = [authMiddleware];

export const loader = async ({ context }: LoaderFunctionArgs) => {
  return loadConnectionNodes(context);
};

export default function ConnectionsListRoute() {
  const viewMode = useLayoutStore((state) => state.viewMode);
  const { nodes, credentials, connectionConfigs } =
    useLoaderData<typeof loader>();

  useInitConnections(connectionConfigs, credentials);
  const { openModal } = useModal();

  if (nodes.length === 0) {
    return (
      <Section>
        <EmptyState
          icon={FileSearch}
          title="No storage connections"
          description="Add a storage connection to view your cloud storage."
          action={
            <Button
              size="lg"
              variant="neutral"
              onPress={() => openModal("add-connection")}
            >
              Connect Storage
            </Button>
          }
        />
      </Section>
    );
  }

  return (
    <DirectoryView
      viewMode={viewMode}
      nodes={nodes}
      name={title}
      showFilters
      secondaryActions={<ViewModeToggle />}
    >
      <Button variant="secondary" onPress={() => openModal("add-connection")}>
        <Plug size={16} /> Connect Storage
      </Button>
    </DirectoryView>
  );
}
