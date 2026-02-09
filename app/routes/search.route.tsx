import { _Object } from "@aws-sdk/client-s3";
import { LoaderFunction, useLoaderData } from "react-router";

import { ObjectPresignedUrl } from "./objects.route";
import { authContext, authMiddleware } from "~/.server/auth/authMiddleware";
import { getS3Client } from "~/.server/auth/getS3Client";
import { BreadcrumbLink } from "~/components/Breadcrumbs/BreadcrumbLink";
import { Container } from "~/components/Container";
import {
  buildDirectoryTree,
  TreeNode,
} from "~/components/DirectoryView/buildDirectoryTree";
import { DirectoryTree } from "~/components/DirectoryView/DirectoryViewTree";
import { H1 } from "~/components/Fonts";
import { getObjects } from "~/utils/getObjects";

type BucketFiles = Record<string, _Object[]>;

export interface SearchRouteLoaderResponse {
  searchQuery: string;
  nodes: TreeNode[];
}

export const middleware = [authMiddleware];

export const handle = {
  breadcrumb: () => {
    return (
      <BreadcrumbLink key="search" to={`/search`}>
        Search
      </BreadcrumbLink>
    );
  },
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
    bucketConfigs,
  } = context.get(authContext);

  // Key format: provider/bucketName to match resourceId format
  const files = await bucketConfigs.reduce(async (acc, bucketConfig) => {
    const credentials = bucketsCredentials[bucketConfig.name];
    if (!credentials) {
      console.warn(`No credentials for bucket: ${bucketConfig.name}`);
      return acc;
    }

    const s3Client = await getS3Client(bucketConfig, credentials, user.sub);
    const _files =
      (await getObjects(bucketConfig, s3Client, searchQuery)) ?? [];

    // Do not return bucket names w/o files
    if (_files.length === 0) {
      return acc;
    }

    const key = `${bucketConfig.provider}/${bucketConfig.name}`;
    return { ...(await acc), [key]: _files };
  }, {} as Promise<BucketFiles>);

  // Build tree nodes with provider info from key format
  const nodes: TreeNode[] = Object.keys(files).map((key) => {
    const [provider, bucketName] = key.split("/");
    return {
      bucketName,
      name: bucketName,
      type: "bucket",
      provider,
      children: buildDirectoryTree(
        bucketName,
        files[key] as ObjectPresignedUrl[],
        provider,
        "",
      ),
    };
  });

  return { searchQuery, nodes };
};

export default function SearchRoute() {
  const { searchQuery, nodes } = useLoaderData<SearchRouteLoaderResponse>();

  return (
    <Container>
      <H1>{`Search: ${searchQuery}`}</H1>

      <div className="bg-slate-100">
        <DirectoryTree nodes={nodes} />
      </div>
    </Container>
  );
}
