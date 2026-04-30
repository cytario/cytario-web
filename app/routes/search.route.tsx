import { _Object } from "@aws-sdk/client-s3";
import { H1 } from "@cytario/design";
import { type LoaderFunctionArgs, useLoaderData } from "react-router";

import type { ConnectionConfig } from "~/.generated/client";
import { authContext } from "~/.server/auth/authMiddleware";
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
    credentials: connectionsCredentials,
    connectionConfigs,
  } = context.get(authContext);

  const results: ConfigFiles[] = [];

  for (const connectionConfig of connectionConfigs) {
    const credentials = connectionsCredentials[connectionConfig.name];
    if (!credentials) {
      console.warn(`No credentials for connection: ${connectionConfig.name}`);
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
    id: `${config.name}/`,
    connectionName: config.name,
    name: config.name,
    type: "bucket" as const,
    pathName: "",
    children: buildDirectoryTree(
      files as _Object[],
      config.name,
      config.prefix ?? "",
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
