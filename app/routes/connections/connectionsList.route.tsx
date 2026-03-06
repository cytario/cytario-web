import { Credentials } from "@aws-sdk/client-sts";
import { ButtonLink, EmptyState } from "@cytario/design";
import { FileSearch, Plug } from "lucide-react";
import {
  type LoaderFunction,
  type MetaFunction,
  type ShouldRevalidateFunction,
} from "react-router";
import { useLoaderData } from "react-router";

import { ConnectionConfig } from "~/.generated/client";
import { authMiddleware } from "~/.server/auth/authMiddleware";
import { Section } from "~/components/Container";
import { TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
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

export const middleware = [authMiddleware];

export const loader: LoaderFunction = async ({ context }) => {
  return loadConnectionNodes(context);
};

export default function ConnectionsListRoute() {
  const viewMode = useLayoutStore((state) => state.viewMode);
  const { nodes, credentials, bucketConfigs } = useLoaderData<{
    nodes: TreeNode[];
    credentials: Record<string, Credentials>;
    bucketConfigs: ConnectionConfig[];
  }>();

  useInitConnections(bucketConfigs, credentials);

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
      bucketName=""
    >
      <ViewModeToggle />
      <ButtonLink href="/connect-bucket" variant="secondary">
        <Plug size={16} /> Connect Storage
      </ButtonLink>
    </DirectoryView>
  );
}
