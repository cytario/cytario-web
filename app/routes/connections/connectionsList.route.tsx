import { ButtonLink, EmptyState } from "@cytario/design";
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
import { loadConnectionNodes } from "~/routes/connections/loadConnectionNodes";

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

  if (nodes.length === 0) {
    return (
      <Section>
        <EmptyState
          icon={FileSearch}
          title="No storage connections"
          description="Add a storage connection to view your cloud storage."
          action={
            <ButtonLink href="/connect-bucket" size="lg" variant="neutral">
              Connect Storage
            </ButtonLink>
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
    >
      <ViewModeToggle />
      <ButtonLink href="/connect-bucket" variant="secondary">
        <Plug size={16} /> Connect Storage
      </ButtonLink>
    </DirectoryView>
  );
}
