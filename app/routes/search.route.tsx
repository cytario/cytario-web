import { _Object } from "@aws-sdk/client-s3";
import { H1 } from "@cytario/design";
import { type LoaderFunctionArgs, useLoaderData } from "react-router";

import type { ConnectionConfig } from "~/.generated/client";
import { authContext, authMiddleware } from "~/.server/auth/authMiddleware";
import { getS3Client } from "~/.server/auth/getS3Client";
import { Section } from "~/components/Container";
import {
  buildDirectoryTree,
  TreeNode,
} from "~/components/DirectoryView/buildDirectoryTree";
import { DirectoryTree } from "~/components/DirectoryView/DirectoryViewTree";
import { getObjects } from "~/utils/getObjects";

interface ConfigFiles {
  config: ConnectionConfig;
  files: _Object[];
}

export interface SearchRouteLoaderResponse {
  searchQuery: string;
  nodes: TreeNode[];
}

export const middleware = [authMiddleware];

export const handle = {
  breadcrumb: () => ({ label: "Search", to: "/search" }),
};

export const loader = async ({
  request,
  context,
}: LoaderFunctionArgs): Promise<SearchRouteLoaderResponse> => {
  const url = new URL(request.url);
  const searchQuery = url.searchParams.get("query") ?? "";

  const {
    user,
    credentials: bucketsCredentials,
    connectionConfigs,
  } = context.get(authContext);

  const results: ConfigFiles[] = [];

  for (const connectionConfig of connectionConfigs) {
    const credentials = bucketsCredentials[connectionConfig.bucketName];
    if (!credentials) {
      console.warn(`No credentials for bucket: ${connectionConfig.bucketName}`);
      continue;
    }

    const s3Client = await getS3Client(connectionConfig, credentials, user.sub);
    const files =
      (await getObjects(connectionConfig, s3Client, searchQuery)) ?? [];

    if (files.length > 0) {
      results.push({ config: connectionConfig, files });
    }
  }

  const nodes: TreeNode[] = results.map(({ config, files }) => ({
    connectionName: config.name,
    bucketName: config.bucketName,
    name: config.name,
    type: "bucket" as const,
    provider: config.provider,
    children: buildDirectoryTree(
      config.bucketName,
      files as _Object[],
      config.provider,
      config.name,
      "",
    ),
  }));

  return { searchQuery, nodes };
};

export default function SearchRoute() {
  const { searchQuery, nodes } = useLoaderData<typeof loader>();

  return (
    <Section>
      <H1>{`Search: ${searchQuery}`}</H1>

      <div className="bg-slate-100">
        <DirectoryTree nodes={nodes} />
      </div>
    </Section>
  );
}
