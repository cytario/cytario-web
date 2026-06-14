import { Credentials } from "@aws-sdk/client-sts";
import { type LoaderFunctionArgs } from "react-router";

import { ConnectionConfig } from "~/.generated/client";
import { authContext } from "~/.server/auth/authMiddleware";
import { TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { type NotificationInput } from "~/components/Notification/Notification.store";
import { getConnection } from "~/routes/connections/connections.server";
import { checkIsFavorite } from "~/routes/favorites/favorites.server";
import {
  ConnectionPrefixError,
  getName,
  prefixSchema,
  resolveConnectionPrefix,
} from "~/utils/pathUtils";
import { isZarrPath } from "~/utils/zarrUtils";

/**
 * Server-side metadata for an object-browser route. The directory listing
 * itself runs in the browser — see `objects.clientLoader.ts`.
 */
export interface BucketRouteServerLoaderResponse {
  connectionName: string;
  bucketName: string;
  /** URL path segment after /connections/:name/ (relative to connection root). */
  urlPath: string;
  /** Full S3 key (connection prefix + urlPath). */
  pathName: string;
  name: string;
  credentials: Credentials | null;
  connectionConfig: ConnectionConfig;
  isFavorite: boolean;
  /** Set when the URL points at a Zarr directory; the chunk listing is skipped. */
  serverDeterminedSingleFile: boolean;
  /** `true` during SSR; `clientLoader` flips it once the listing resolves. */
  pendingClientLoad: boolean;
  /**
   * Populated when the STS mint for this connection failed (e.g. the role's
   * trust policy denied AssumeRoleWithWebIdentity). The route renders an
   * error banner instead of the directory listing / viewer.
   */
  connectionError: string | null;
}

export interface BucketRouteLoaderResponse extends BucketRouteServerLoaderResponse {
  nodes: TreeNode[];
  /** True when the route should render the viewer rather than a directory listing. */
  isSingleFile?: boolean;
  notification?: NotificationInput;
}

export const loader = async ({ params, context }: LoaderFunctionArgs) => {
  const { user, credentials: connectionsCredentials, credentialErrors } = context.get(authContext);
  const { name: connectionName } = params;

  if (!connectionName) throw new Error("Connection name is required");

  const connectionConfig = await getConnection(user, connectionName);
  if (!connectionConfig) {
    throw new Error("Connection configuration not found");
  }

  const { bucketName } = connectionConfig;

  const credentials = connectionsCredentials[connectionName] ?? null;
  const connectionError = credentials
    ? null
    : (credentialErrors[connectionName] ??
      "No credentials available for this connection. Verify the connection's role configuration.");

  const rawUrlPath = params["*"] ?? "";

  const parsed = prefixSchema.safeParse(rawUrlPath);
  if (!parsed.success) {
    throw new Response(parsed.error.issues[0]?.message ?? "Invalid path", { status: 400 });
  }

  let urlPath: string;
  let pathName: string;
  try {
    ({ urlPath, pathName } = resolveConnectionPrefix(connectionConfig.prefix, parsed.data));
  } catch (error) {
    if (error instanceof ConnectionPrefixError) {
      throw new Response(error.message, { status: 400 });
    }
    throw error;
  }
  const name = getName(pathName, bucketName);

  const isFavorite = await checkIsFavorite(user.sub, connectionName, urlPath);
  const serverDeterminedSingleFile = isZarrPath(pathName);

  // SSR-safe defaults; `clientLoader` overwrites the listing fields after hydration.
  const payload: BucketRouteLoaderResponse = {
    connectionName,
    bucketName,
    urlPath,
    pathName,
    name,
    credentials,
    connectionConfig,
    isFavorite,
    serverDeterminedSingleFile,
    pendingClientLoad: connectionError ? false : true,
    nodes: [],
    isSingleFile: serverDeterminedSingleFile,
    connectionError,
  };

  return payload;
};
