import { type S3Client } from "@aws-sdk/client-s3";
import { type Credentials } from "@aws-sdk/client-sts";
import { createContext, type MiddlewareFunction } from "react-router";

import { type ConnectionConfig } from "~/.generated/client";
import { authContext } from "~/.server/auth/authMiddleware";
import { getS3Client } from "~/.server/auth/getS3Client";
import { getConnection } from "~/routes/connections/connections.server";

export interface ConnectionContextData {
  connectionConfig: ConnectionConfig;
  credentials: Credentials;
  s3Client: S3Client;
}

export const connectionContext = createContext<ConnectionContextData>();

/**
 * Resolves `params.connectionName` into config + credentials + a ready-to-use
 * signed S3 client, and stuffs it into `connectionContext`. Throws Response
 * 400 / 404 / 401 for missing param / unknown connection / missing
 * credentials respectively.
 *
 * Must run after `authMiddleware` (or after the layout-level auth, for
 * routes nested under a protected layout).
 */
export const connectionMiddleware: MiddlewareFunction = async ({
  params,
  context,
}) => {
  const connectionName = params.connectionName;
  if (!connectionName) {
    throw new Response("Connection name is required", { status: 400 });
  }

  const { user, credentials: connectionsCredentials } =
    context.get(authContext);

  const connectionConfig = await getConnection(user, connectionName);
  if (!connectionConfig) {
    throw new Response("Connection configuration not found", { status: 404 });
  }

  const credentials = connectionsCredentials[connectionName];
  if (!credentials) {
    throw new Response("No credentials for connection", { status: 401 });
  }

  const s3Client = await getS3Client(connectionConfig, credentials, user.sub);

  context.set(connectionContext, {
    connectionConfig,
    credentials,
    s3Client,
  });
};
