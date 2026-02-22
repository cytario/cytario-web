import { Credentials } from "@aws-sdk/client-sts";
import { ButtonLink, EmptyState } from "@cytario/design";
import { FileSearch, Plug } from "lucide-react";
import { useEffect } from "react";
import {
  type LoaderFunction,
  type MetaFunction,
  type ShouldRevalidateFunction,
} from "react-router";
import { useLoaderData } from "react-router";

import { BucketConfig } from "~/.generated/client";
import { authMiddleware } from "~/.server/auth/authMiddleware";
import { Section } from "~/components/Container";
import { TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { DirectoryView } from "~/components/DirectoryView/DirectoryView";
import { useLayoutStore } from "~/components/DirectoryView/useLayoutStore";
import { ViewModeToggle } from "~/components/DirectoryView/ViewModeToggle";
import { loadBucketNodes } from "~/routes/buckets/loadBucketNodes";
import { select, useConnectionsStore } from "~/utils/connectionsStore";

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
  return loadBucketNodes(context);
};

export default function BucketsListRoute() {
  const viewMode = useLayoutStore((state) => state.viewMode);
  const { nodes, credentials, bucketConfigs } = useLoaderData<{
    nodes: TreeNode[];
    credentials: Record<string, Credentials>;
    bucketConfigs: BucketConfig[];
  }>();

  const setConnection = useConnectionsStore(select.setConnection);

  useEffect(() => {
    for (const config of bucketConfigs) {
      const creds = credentials[config.name];
      if (creds) {
        setConnection(`${config.provider}/${config.name}`, creds, config);
      }
    }
  }, [credentials, bucketConfigs, setConnection]);

  if (nodes.length === 0) {
    return (
      <Section>
        <EmptyState
          icon={FileSearch}
          title="No storage connections"
          description="Add a storage connection to view your cloud storage."
          action={
            <ButtonLink href="/connect-bucket" size="lg" variant="primary">
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
