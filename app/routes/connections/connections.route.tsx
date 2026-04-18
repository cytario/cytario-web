import { Button, EmptyState } from "@cytario/design";
import { FileSearch, Plug } from "lucide-react";
import {
  type ActionFunctionArgs,
  type MetaFunction,
  type ShouldRevalidateFunction,
  useLoaderData,
} from "react-router";

import type { LoaderData } from "./connections.loader";
import { createAction } from "./createConnection.action";
import { deleteAction } from "./deleteConnection.action";
import { updateAction } from "./updateConnection.action";
import { authMiddleware } from "~/.server/auth/authMiddleware";
import { Section } from "~/components/Container";
import { DirectoryView } from "~/components/DirectoryView/DirectoryView";
import { ShowFiltersToggle } from "~/components/DirectoryView/ShowFiltersToggle";
import { useLayoutStore } from "~/components/DirectoryView/useLayoutStore";
import { ViewModeToggle } from "~/components/DirectoryView/ViewModeToggle";
import { useInitConnections } from "~/hooks/useInitConnections";
import { useModal } from "~/hooks/useModal";

export const action = async (args: ActionFunctionArgs) => {
  switch (args.request.method.toUpperCase()) {
    case "POST":
      return createAction(args);
    case "DELETE":
      return deleteAction(args);
    case "PATCH":
      return updateAction(args);
    default:
      return new Response("Method not allowed", { status: 405 });
  }
};

export { loadConnections as loader } from "./connections.loader";

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

export default function ConnectionsListRoute() {
  const viewMode = useLayoutStore((state) => state.viewMode);
  const { nodes, credentials, connectionConfigs } =
    useLoaderData<LoaderData>();

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
