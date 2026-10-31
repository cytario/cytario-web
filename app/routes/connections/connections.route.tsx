import { Button, EmptyState, Icon } from "@cytario/design";
import {
  type ActionFunctionArgs,
  type MetaFunction,
  type ShouldRevalidateFunction,
  useLoaderData,
} from "react-router";

import type { LoaderData } from "./connections.loader";
import { createAction } from "./createConnection.action";
import { deleteAction } from "./deleteConnection.action";
import { reapplyAction } from "./reapplyConnection.action";
import { shareAction } from "./shareFolder.action";
import { updateAction } from "./updateConnection.action";
import { Section } from "~/components/Container";
import { DirectoryView } from "~/components/DirectoryView/DirectoryView";
import { ViewModeToggle } from "~/components/DirectoryView/ViewModeToggle";
import { useModal } from "~/hooks/useModal";
import { buildVirtualNode } from "~/utils/treeNodeFactories";

export { enrichConnectionsWithPreviews as clientLoader } from "./connections.clientLoader";
export { loadConnections as loader } from "./connections.loader";

// Connection CRUD submits to the org root (the connection list), so the
// action lives on this route. Its responses carry connection config — keep
// them out of every cache.
export const headers = () => ({ "Cache-Control": "no-store, private" });

export const action = async (args: ActionFunctionArgs) => {
  const method = args.request.method.toUpperCase();
  if (method === "DELETE") return deleteAction(args);
  if (method === "PATCH") return updateAction(args);
  if (method !== "POST") return new Response("Method not allowed", { status: 405 });

  // Peek the intent on a clone so the handler can still read the body once.
  const intent = (await args.request.clone().formData()).get("_intent");
  switch (intent) {
    case "share":
      return shareAction(args);
    case "reapply":
      return reapplyAction(args);
    default:
      return createAction(args);
  }
};

const title = "Connections";

export const meta: MetaFunction = () => [{ title: `${title} — Cytario` }];

export const shouldRevalidate: ShouldRevalidateFunction = ({
  currentUrl,
  nextUrl,
  formAction,
  defaultShouldRevalidate,
}) => {
  if (formAction) return defaultShouldRevalidate;
  // An organization switch changes the /:org segment while staying on this
  // route — the list must reload or it keeps showing the previous tenant's
  // connections.
  if (currentUrl.pathname.split("/")[1] !== nextUrl.pathname.split("/")[1]) return true;
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
      <ViewModeToggle />
    </DirectoryView>
  );
}
