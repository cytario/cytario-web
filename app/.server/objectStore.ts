import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import type { ConnectionConfigWithGrants } from "./auth/authMiddleware";
import { hostRequestStorage } from "./hostRequestContext";
import {
  getProviderCatalog,
  resolveConnectionProviderWithGrants,
} from "./providers/providerCatalog.server";
import type { ObjectStore, StorageEntry } from "@cytario/plugin-api";
import { listConnections } from "~/routes/connections/connections.server";
import { canSee } from "~/utils/authorization";
import type { AccessLevel } from "~/utils/providerCatalog.schema";
import { getS3ProviderConfig } from "~/utils/s3Provider";

function requireRequestData() {
  const data = hostRequestStorage.getStore();
  if (!data) {
    throw new Error(
      "Host capabilities called outside a request context — ensure the request pipeline sets up hostRequestStorage before plugin loaders/actions run",
    );
  }
  return data;
}

/**
 * Whether a connection's grant permits general (arbitrary) object writes.
 * Read Write and Admin both allow PutObject + DeleteObject at the connection
 * prefix; Annotate allows only annotation sidecars; Read Only allows no
 * writes at all. The `objectStore` capability requires Read Write or Admin
 * for `put` and `delete` (SRS-CY-37302).
 */
function permitsGeneralWrite(grants: { accessLevel: AccessLevel }[]): boolean {
  return grants.some((g) => g.accessLevel === "read-write" || g.accessLevel === "admin");
}

/**
 * Resolves a connection by id, validates the user's authorization, and
 * checks the write level for write/delete operations. Returns the
 * connection config + resolved provider attributes (role ARN, region,
 * endpoint) needed to mint an STS session.
 */
async function resolveWritableConnection(
  connectionId: string,
  requireWrite: boolean,
): Promise<{
  config: ConnectionConfigWithGrants;
  roleArn: string;
  region: string;
  endpoint: string | null;
}> {
  const { user, authTokens } = requireRequestData();
  const configs = await listConnections(user);
  const config = configs.find((c) => c.id === connectionId);
  if (!config) {
    throw new Error(`Connection "${connectionId}" not found or not visible to the user`);
  }
  if (!canSee(user, config)) {
    throw new Error(`Connection "${connectionId}" not found or not visible to the user`);
  }

  const catalog = await getProviderCatalog(user.organization!, authTokens.accessToken);
  const connectionProvider = resolveConnectionProviderWithGrants(catalog, config);
  if (!connectionProvider) {
    throw new Error(`Connection "${connectionId}" has a stale provider reference`);
  }

  if (requireWrite && !permitsGeneralWrite(connectionProvider.grants)) {
    throw new Error(
      `Connection "${connectionId}" does not permit general write at its prefix (access level must be "read-write" or "admin")`,
    );
  }

  const roleArn =
    connectionProvider.grants.find(
      (g) => g.accessLevel === "read-write" || g.accessLevel === "admin",
    )?.roleArn ?? connectionProvider.grants[0]?.roleArn;
  if (!roleArn) {
    throw new Error(`Connection "${connectionId}" has no resolvable grant with a role ARN`);
  }

  return {
    config,
    roleArn,
    region: connectionProvider.region,
    endpoint: connectionProvider.endpoint,
  };
}

/**
 * Builds an S3 key from the connection's prefix and the plugin-supplied key.
 * The key is relative to the connection's prefix — the host prepends the
 * prefix so the plugin cannot write outside the connection's scope.
 */
function buildS3Key(prefix: string, key: string): string {
  const cleanPrefix = prefix.replace(/^\/+|\/+$/g, "");
  const cleanKey = key.replace(/^\/+/, "");
  return cleanPrefix ? `${cleanPrefix}/${cleanKey}` : cleanKey;
}

/**
 * Server-side `ObjectStore` implementation. Validates the connection + write
 * level, mints an STS session scoped to the connection's prefix, and
 * performs S3 PUT/GET/DELETE via a short-lived S3Client. The plugin never
 * sees the bucket name, the S3 credentials, or the full S3 key — it
 * provides a connection ID and a key relative to that connection's prefix.
 */
class ObjectStoreImpl implements ObjectStore {
  async put(connectionId: string, key: string, body: BodyInit): Promise<void> {
    const { config, roleArn, region, endpoint } = await resolveWritableConnection(
      connectionId,
      true,
    );
    const { user, authTokens } = requireRequestData();

    const { buildSessionPolicy } = await import("./auth/sessionPolicy");
    const { AssumeRoleWithWebIdentityCommand, STSClient } = await import("@aws-sdk/client-sts");

    const providerConfig = getS3ProviderConfig(endpoint, region);
    const stsClient = new STSClient({ endpoint: providerConfig.stsEndpoint, region });
    const Policy = providerConfig.isAwsS3
      ? buildSessionPolicy({
          bucketName: config.bucketName,
          prefix: config.prefix,
          subject: user.sub,
          region,
        })
      : undefined;

    const { Credentials } = await stsClient.send(
      new AssumeRoleWithWebIdentityCommand({
        RoleArn: roleArn,
        RoleSessionName: `objectstore-${user.sub}`.replace(/[^\w+=,.@-]/g, "-").slice(0, 64),
        WebIdentityToken: authTokens.idToken,
        DurationSeconds: 900,
        ...(Policy ? { Policy } : {}),
      }),
    );

    if (!Credentials) throw new Error("STS returned no credentials for object store");

    const s3Client = new S3Client({
      endpoint: providerConfig.s3Endpoint,
      region,
      forcePathStyle: !providerConfig.isAwsS3,
      credentials: {
        accessKeyId: Credentials.AccessKeyId!,
        secretAccessKey: Credentials.SecretAccessKey!,
        sessionToken: Credentials.SessionToken,
      },
    });

    const s3Key = buildS3Key(config.prefix, key);
    await s3Client.send(
      new PutObjectCommand({
        Bucket: config.bucketName,
        Key: s3Key,
        Body: body as never,
      }),
    );
  }

  async get(connectionId: string, key: string): Promise<Response> {
    const { config, roleArn, region, endpoint } = await resolveWritableConnection(
      connectionId,
      false,
    );
    const { user, authTokens } = requireRequestData();

    const { buildSessionPolicy } = await import("./auth/sessionPolicy");
    const { AssumeRoleWithWebIdentityCommand, STSClient } = await import("@aws-sdk/client-sts");

    const providerConfig = getS3ProviderConfig(endpoint, region);
    const stsClient = new STSClient({ endpoint: providerConfig.stsEndpoint, region });
    const Policy = providerConfig.isAwsS3
      ? buildSessionPolicy({
          bucketName: config.bucketName,
          prefix: config.prefix,
          subject: user.sub,
          region,
        })
      : undefined;

    const { Credentials } = await stsClient.send(
      new AssumeRoleWithWebIdentityCommand({
        RoleArn: roleArn,
        RoleSessionName: `objectstore-${user.sub}`.replace(/[^\w+=,.@-]/g, "-").slice(0, 64),
        WebIdentityToken: authTokens.idToken,
        DurationSeconds: 900,
        ...(Policy ? { Policy } : {}),
      }),
    );

    if (!Credentials) throw new Error("STS returned no credentials for object store");

    const s3Client = new S3Client({
      endpoint: providerConfig.s3Endpoint,
      region,
      forcePathStyle: !providerConfig.isAwsS3,
      credentials: {
        accessKeyId: Credentials.AccessKeyId!,
        secretAccessKey: Credentials.SecretAccessKey!,
        sessionToken: Credentials.SessionToken,
      },
    });

    const s3Key = buildS3Key(config.prefix, key);
    const response = await s3Client.send(
      new GetObjectCommand({ Bucket: config.bucketName, Key: s3Key }),
    );

    return new Response(response.Body as BodyInit, {
      status: 200,
      headers: response.ContentType ? { "Content-Type": response.ContentType } : undefined,
    });
  }

  async delete(connectionId: string, key: string): Promise<void> {
    const { config, roleArn, region, endpoint } = await resolveWritableConnection(
      connectionId,
      true,
    );
    const { user, authTokens } = requireRequestData();

    const { buildSessionPolicy } = await import("./auth/sessionPolicy");
    const { AssumeRoleWithWebIdentityCommand, STSClient } = await import("@aws-sdk/client-sts");

    const providerConfig = getS3ProviderConfig(endpoint, region);
    const stsClient = new STSClient({ endpoint: providerConfig.stsEndpoint, region });
    const Policy = providerConfig.isAwsS3
      ? buildSessionPolicy({
          bucketName: config.bucketName,
          prefix: config.prefix,
          subject: user.sub,
          region,
        })
      : undefined;

    const { Credentials } = await stsClient.send(
      new AssumeRoleWithWebIdentityCommand({
        RoleArn: roleArn,
        RoleSessionName: `objectstore-${user.sub}`.replace(/[^\w+=,.@-]/g, "-").slice(0, 64),
        WebIdentityToken: authTokens.idToken,
        DurationSeconds: 900,
        ...(Policy ? { Policy } : {}),
      }),
    );

    if (!Credentials) throw new Error("STS returned no credentials for object store");

    const s3Client = new S3Client({
      endpoint: providerConfig.s3Endpoint,
      region,
      forcePathStyle: !providerConfig.isAwsS3,
      credentials: {
        accessKeyId: Credentials.AccessKeyId!,
        secretAccessKey: Credentials.SecretAccessKey!,
        sessionToken: Credentials.SessionToken,
      },
    });

    const s3Key = buildS3Key(config.prefix, key);
    await s3Client.send(new DeleteObjectCommand({ Bucket: config.bucketName, Key: s3Key }));
  }

  async list(connectionId: string, prefix: string): Promise<readonly StorageEntry[]> {
    const { config, roleArn, region, endpoint } = await resolveWritableConnection(
      connectionId,
      false,
    );
    const { user, authTokens } = requireRequestData();

    const { buildSessionPolicy } = await import("./auth/sessionPolicy");
    const { AssumeRoleWithWebIdentityCommand, STSClient } = await import("@aws-sdk/client-sts");

    const providerConfig = getS3ProviderConfig(endpoint, region);
    const stsClient = new STSClient({ endpoint: providerConfig.stsEndpoint, region });
    const Policy = providerConfig.isAwsS3
      ? buildSessionPolicy({
          bucketName: config.bucketName,
          prefix: config.prefix,
          subject: user.sub,
          region,
        })
      : undefined;

    const { Credentials } = await stsClient.send(
      new AssumeRoleWithWebIdentityCommand({
        RoleArn: roleArn,
        RoleSessionName: `objectstore-${user.sub}`.replace(/[^\w+=,.@-]/g, "-").slice(0, 64),
        WebIdentityToken: authTokens.idToken,
        DurationSeconds: 900,
        ...(Policy ? { Policy } : {}),
      }),
    );

    if (!Credentials) throw new Error("STS returned no credentials for object store");

    const s3Client = new S3Client({
      endpoint: providerConfig.s3Endpoint,
      region,
      forcePathStyle: !providerConfig.isAwsS3,
      credentials: {
        accessKeyId: Credentials.AccessKeyId!,
        secretAccessKey: Credentials.SecretAccessKey!,
        sessionToken: Credentials.SessionToken,
      },
    });

    const listPrefix = buildS3Key(config.prefix, prefix);
    const connPrefixS3Key = buildS3Key(config.prefix, "");
    const stripLen = connPrefixS3Key.length > 0 ? connPrefixS3Key.length + 1 : 0;
    const entries: StorageEntry[] = [];
    let continuationToken: string | undefined;
    do {
      const response = await s3Client.send(
        new ListObjectsV2Command({
          Bucket: config.bucketName,
          Prefix: listPrefix
            ? `${listPrefix}/`
            : connPrefixS3Key
              ? `${connPrefixS3Key}/`
              : undefined,
          ContinuationToken: continuationToken,
          MaxKeys: 1000,
        }),
      );
      for (const obj of response.Contents ?? []) {
        if (!obj.Key) continue;
        entries.push({
          key: obj.Key.slice(stripLen),
          size: obj.Size ?? 0,
        });
      }
      continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
    } while (continuationToken);
    return entries;
  }
}

export function createObjectStore(): ObjectStore {
  return new ObjectStoreImpl();
}
