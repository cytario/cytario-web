import { _Object } from "@aws-sdk/client-s3";
import { LoaderFunction, useLoaderData } from "react-router";

import { ObjectPresignedUrl } from "./objects.route";
import { BucketConfig } from "~/.generated/client";
import { authContext, authMiddleware } from "~/.server/auth/authMiddleware";
import { getS3Client } from "~/.server/auth/getS3Client";
import { UserProfile } from "~/.server/auth/getUserInfo";
import BreadcrumbLink from "~/components/Breadcrumbs/BreadcrumbLink";
import { Container } from "~/components/Container";
import {
  buildDirectoryTree,
  TreeNode,
} from "~/components/DirectoryView/buildDirectoryTree";
import DirectoryTree from "~/components/DirectoryView/DirectoryViewTree";
import { H1 } from "~/components/Fonts";
import { GlobalSearchResults } from "~/components/GlobalSearch/GlobalSearch";
import { getBucketConfigsForUser } from "~/utils/bucketConfig";
import { getObjects } from "~/utils/getObjects";

export type BucketFiles = Record<string, _Object[]>;

export interface SearchRouteLoaderResponse {
  searchQuery: string;
  user?: UserProfile;
  results: GlobalSearchResults;
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
  // const { idToken, user } = context.get(authContext);

  const url = new URL(request.url);
  const searchQuery = url.searchParams.get("query") ?? "";

  const { user, credentials: bucketsCredentials } = context.get(authContext);

  const bucketConfigs: BucketConfig[] = await getBucketConfigsForUser(user.sub);

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

  // TODO:Refactor global search
  const results = { files };

  return { searchQuery, results };
};

export default function SearchRoute() {
  const { searchQuery, results } = useLoaderData<SearchRouteLoaderResponse>();

  // Keys are in format provider/bucketName
  const children: TreeNode[] = Object.keys(results.files).map((key) => {
    const [provider, bucketName] = key.split("/");
    return {
      bucketName,
      name: bucketName,
      type: "bucket",
      _Bucket: { provider } as BucketConfig,
      children: buildDirectoryTree(
        bucketName,
        results.files[key] as ObjectPresignedUrl[],
        ""
      ),
    };
  });

  return (
    <Container>
      <H1>{`Search: ${searchQuery}`}</H1>

      <div className="bg-slate-100">
        <DirectoryTree nodes={children} />
      </div>

      {/* <code>{JSON.stringify(results)}</code> */}
    </Container>
  );
}
