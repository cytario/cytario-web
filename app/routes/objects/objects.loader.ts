import { Credentials } from "@aws-sdk/client-sts";
import { type LoaderFunctionArgs } from "react-router";

import { ConnectionConfig } from "~/.generated/client";
import { authContext } from "~/.server/auth/authMiddleware";
import { TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { type NotificationInput } from "~/components/Notification/Notification.store";
import { getConnection } from "~/routes/connections/connections.server";
import {
  ConnectionPrefixError,
  getName,
  prefixSchema,
  resolveConnectionPrefix,
} from "~/utils/pathUtils";
import { isZarrPath } from "~/utils/zarrUtils";

export interface BucketRouteServerLoaderResponse {
  connectionId: string;
  connectionName: string;
  bucketName: string;
  urlPath: string;
  pathName: string;
  name: string;
  credentials: Credentials | null;
  connectionConfig: ConnectionConfig;
  serverDeterminedSingleFile: boolean;
  pendingClientLoad: boolean;
  connectionError: string | null;
}

export interface BucketRouteLoaderResponse extends BucketRouteServerLoaderResponse {
  nodes: TreeNode[];
  isSingleFile?: boolean;
  notification?: NotificationInput;
}

export const loader = async ({ params, context }: LoaderFunctionArgs) => {
  const { user, credentials: connectionsCredentials, credentialErrors } = context.get(authContext);
  const { id: connectionId } = params;

  if (!connectionId) throw new Error("Connection id is required");

  const connectionConfig = await getConnection(user, connectionId);
  if (!connectionConfig) {
    throw new Error("Connection configuration not found");
  }

  const { bucketName, name: connectionName } = connectionConfig;

  const credentials = connectionsCredentials[connectionId] ?? null;
  const connectionError = credentials
    ? null
    : (credentialErrors[connectionId] ??
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

  const serverDeterminedSingleFile = isZarrPath(pathName);

  const payload: BucketRouteLoaderResponse = {
    connectionId,
    connectionName,
    bucketName,
    urlPath,
    pathName,
    name,
    credentials,
    connectionConfig,
    serverDeterminedSingleFile,
    pendingClientLoad: connectionError ? false : true,
    nodes: [],
    isSingleFile: serverDeterminedSingleFile,
    connectionError,
  };

  return payload;
};
