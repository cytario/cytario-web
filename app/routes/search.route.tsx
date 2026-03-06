import { _Object } from "@aws-sdk/client-s3";
import { H1 } from "@cytario/design";
import { LoaderFunction, useLoaderData } from "react-router";

import { ObjectPresignedUrl } from "./objects.route";
import { authContext, authMiddleware } from "~/.server/auth/authMiddleware";
import { getS3Client } from "~/.server/auth/getS3Client";
import { Section } from "~/components/Container";
import {
  buildDirectoryTree,
  TreeNode,
} from "~/components/DirectoryView/buildDirectoryTree";
import { DirectoryTree } from "~/components/DirectoryView/DirectoryViewTree";
import { getObjects } from "~/utils/getObjects";

export interface SearchRouteLoaderResponse {
  searchQuery: string;
  nodes: TreeNode[];
}

export const middleware = [authMiddleware];

export const handle = {
  breadcrumb: () => ({ label: "Search", to: "/search" }),
};

export const loader: LoaderFunction = async ({
  request,
  context,
}): Promise<SearchRouteLoaderResponse> => {
  const url = new URL(request.url);
  const searchQuery = url.searchParams.get("query") ?? "";

  const {
    user,
    credentials: bucketsCredentials,
    connectionConfigs,
  } = context.get(authContext);

  type ConfigFiles = { config: typeof connectionConfigs[number]; files: _Object[] };
  const results: ConfigFiles[] = [];

  for (const connectionConfig of connectionConfigs) {
    const credentials = bucketsCredentials[connectionConfig.name];
    if (!credentials) {
      console.warn(`No credentials for bucket: ${connectionConfig.name}`);
      continue;
    }

    const s3Client = await getS3Client(connectionConfig, credentials, user.sub);
    const _files =
      (await getObjects(connectionConfig, s3Client, searchQuery)) ?? [];

    if (_files.length > 0) {
      results.push({ config: connectionConfig, files: _files });
    }
  }

  const nodes: TreeNode[] = results.map(({ config, files: configFiles }) => ({
    alias: config.alias,
    bucketName: config.name,
    name: config.name,
    type: "bucket" as const,
    provider: config.provider,
    children: buildDirectoryTree(
      config.name,
      configFiles as ObjectPresignedUrl[],
      config.provider,
      config.alias,
    ),
  }));

  return { searchQuery, nodes };
};

export default function SearchRoute() {
  const { searchQuery, nodes } = useLoaderData<SearchRouteLoaderResponse>();

  return (
    <Section>
      <H1>{`Search: ${searchQuery}`}</H1>

      <div className="bg-slate-100">
        <DirectoryTree nodes={nodes} />
      </div>
    </Section>
  );
}
