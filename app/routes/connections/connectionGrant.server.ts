import type { ConnectionConfig, ConnectionGrant } from "~/.generated/client";
import type { UserProfile } from "~/.server/auth/getUserInfo";
import { prisma } from "~/.server/db/prisma";
import { findBucketByName, getBucketCatalog } from "~/.server/providers/bucketCatalog.server";
import {
  type ConnectionProvider,
  findProviderConnection,
  findStorageRole,
  getProviderCatalog,
} from "~/.server/providers/providerCatalog.server";
import { type BucketPolicyGrant } from "~/.server/storage/bucketPolicy";
import {
  type ApplyResult,
  type ApplyTarget,
  applyBucketPolicy,
} from "~/.server/storage/bucketPolicyApply.server";
import { cytarioConfig } from "~/config";
import { ORG_ROOT_SCOPE, adminCovers } from "~/utils/authorization";
import type { BucketCatalog } from "~/utils/bucketCatalog.schema";
import {
  type ProviderCatalog,
  type ProviderConnection,
  type ProviderRole,
} from "~/utils/providerCatalog.schema";

/**
 * The connection whose provider role runs the write, plus the id token minted for
 * the acting user and the display name used for the STS `RoleSessionName`.
 */
export interface ActingContext {
  user: UserProfile;
  idToken: string;
  accessToken: string;
}

/**
 * Build the managed bucket-policy grant a single grant row intends. The grant's
 * `accessLevel` is resolved to a concrete role ARN (and validated level) by the
 * caller (via the provider catalog) and injected onto the `BucketPolicyGrant` so
 * the fail-closed policy generator accepts it.
 */
export function grantForConnection(
  config: { organization: string; bucketName: string; prefix: string },
  grant: { scope: string },
  roleArn: string,
  accessLevel: ConnectionProvider["accessLevel"],
): BucketPolicyGrant {
  return {
    organization: config.organization,
    bucketName: config.bucketName,
    groupPath: grant.scope,
    prefix: config.prefix,
    accessLevel,
    roleArn,
  };
}

/** A persisted connection config with its grants eager-loaded. */
export type ConnectionConfigWithGrants = ConnectionConfig & { grants: ConnectionGrant[] };

/**
 * Assemble the FULL desired managed grant set for a bucket in the active org from
 * its persisted connections' grants. Grants derive from already-persisted rows —
 * each row was authorized against its submitted scope when it was created or
 * updated; no additional per-row authorization happens here. Passing the full set
 * to `applyBucketPolicy` makes the write idempotent and makes un-share fall out
 * naturally — a removed connection is simply absent from the set.
 *
 * Each grant's `accessLevel` is resolved against the catalog to a concrete role
 * ARN for the connection's bucket; grants whose level has no role for the
 * bucket (stale catalog / role deleted) are skipped — they cannot contribute a
 * Principal and would fail the generator.
 */
export function assembleBucketGrants(
  configs: ConnectionConfigWithGrants[],
  catalog: ProviderCatalog,
  bucketCatalog?: BucketCatalog,
): BucketPolicyGrant[] {
  const grants: BucketPolicyGrant[] = [];
  for (const config of configs) {
    const bucketRow = bucketCatalog
      ? findBucketByName(bucketCatalog, config.providerConnectionId, config.bucketName)
      : undefined;
    for (const grant of config.grants) {
      const storageRole = findStorageRole(catalog, {
        providerConnectionId: config.providerConnectionId,
        accessLevel: grant.accessLevel as never,
        ...(bucketRow ? { bucketId: bucketRow.id } : {}),
      });
      if (!storageRole) continue;
      grants.push(grantForConnection(config, grant, storageRole.roleArn, storageRole.accessLevel));
    }
  }
  return grants;
}

export type ValidatedProviderRefs =
  | { ok: true; providerConnection: ProviderConnection; providerRoles: ProviderRole[] }
  | { ok: false; errors: Record<string, string[]> };

/**
 * Validate submitted provider connection + grant access levels against the
 * catalog: the provider connection must exist and every grant's access level
 * must have a storage role for the connection's bucket in the catalog, and
 * that role's allowed scopes must cover the grant's scope (an org-wide role
 * with empty `allowedScopes` covers any scope). The client-side selector
 * filtering is advisory only — this is the authoritative check on the submitted
 * values.
 */
export function validateProviderRefs(
  catalog: ProviderCatalog,
  refs: {
    providerConnectionId: string;
    bucketName: string;
    grants: Array<{ accessLevel: string; scope: string }>;
  },
  bucketCatalog?: BucketCatalog,
): ValidatedProviderRefs {
  const providerConnection = findProviderConnection(catalog, refs.providerConnectionId);
  if (!providerConnection) {
    return { ok: false, errors: { providerConnectionId: ["Unknown provider connection"] } };
  }

  const bucketRow = bucketCatalog
    ? findBucketByName(bucketCatalog, providerConnection.id, refs.bucketName)
    : undefined;

  const providerRoles: ProviderRole[] = [];
  const errors: Record<string, string[]> = {};
  for (const [index, grant] of refs.grants.entries()) {
    const storageRole = findStorageRole(catalog, {
      providerConnectionId: providerConnection.id,
      accessLevel: grant.accessLevel as never,
      ...(bucketRow ? { bucketId: bucketRow.id } : {}),
    });
    if (!storageRole) {
      errors[`grants.${index}.accessLevel`] = [
        `No storage role for access level "${grant.accessLevel}" on this bucket`,
      ];
      continue;
    }

    const isOrgWide = storageRole.allowedScopes.length === 0;
    if (
      grant.scope !== ORG_ROOT_SCOPE &&
      !isOrgWide &&
      !storageRole.allowedScopes.some((allowed) => adminCovers(allowed, grant.scope))
    ) {
      errors[`grants.${index}.accessLevel`] = [
        `This access level does not cover the chosen scope on this bucket`,
      ];
      continue;
    }

    providerRoles.push(storageRole);
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, providerConnection, providerRoles };
}

/**
 * Outcome of validating the submitted bucket against the portal bucket catalog.
 * In an OSS build there is no portal bucket registry, so the check is skipped
 * (returns `ok: true` immediately). In an admin-portal build the submitted
 * `bucketName` must be one of the org's registered buckets under the submitted
 * `providerConnectionId`; a bucket not in the catalog is rejected with a
 * field-level error. When the bucket lookup is unavailable, the create/update
 * is refused with a clear error rather than accepting a free-text bucket.
 */
export type BucketRefValidation =
  { ok: true } | { ok: false; errors: Record<string, string[]> } | { ok: false; formError: string };

export async function validateBucketRef(
  organization: string,
  accessToken: string,
  refs: { providerConnectionId: string; bucketName: string },
): Promise<BucketRefValidation> {
  if (cytarioConfig.providers.source !== "portal") return { ok: true };

  let bucketCatalog;
  try {
    bucketCatalog = await getBucketCatalog(organization, accessToken);
  } catch (error) {
    return {
      ok: false,
      formError:
        error instanceof Error ? error.message : "Bucket catalog is currently unavailable.",
    };
  }

  const bucket = findBucketByName(bucketCatalog, refs.providerConnectionId, refs.bucketName);
  if (!bucket) {
    return {
      ok: false,
      errors: {
        bucketName: ["This bucket is not registered under the selected provider connection."],
      },
    };
  }

  return { ok: true };
}

/**
 * Resolve a connection to its `ApplyTarget` via the org provider catalog. The
 * write session runs under a grant whose resolved storage role is an Admin-level
 * role (`accessLevel === "admin"` — the only level that permits
 * `s3:PutBucketPolicy`); when none of the grants' roles is Admin, the first
 * resolvable grant's role is used as a best-effort fallback. The acting user
 * must administer the connection (canModify) before this is called.
 */
export async function resolveApplyTarget(
  config: ConnectionConfigWithGrants,
  accessToken: string,
): Promise<
  | { ok: true; target: ApplyTarget; connectionProvider: ConnectionProvider }
  | { ok: false; error: string }
> {
  let catalog;
  try {
    catalog = await getProviderCatalog(config.organization, accessToken);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Provider catalog is unavailable.",
    };
  }

  const bucketCatalog = await bucketCatalogFor(config.organization, accessToken);

  return resolveApplyTargetFromCatalog(config, catalog, bucketCatalog);
}

/** The org bucket catalog, or `undefined` in OSS builds / when the lookup fails. */
async function bucketCatalogFor(
  organization: string,
  accessToken: string,
): Promise<BucketCatalog | undefined> {
  if (cytarioConfig.providers.source !== "portal") return undefined;
  try {
    return await getBucketCatalog(organization, accessToken);
  } catch {
    return undefined;
  }
}

/** Resolve the storage role backing a persisted grant, scoped to its connection's bucket. */
function findStorageRoleForConfig(
  catalog: ProviderCatalog,
  config: { providerConnectionId: string; bucketName: string },
  grant: { accessLevel: string },
  bucketCatalog?: BucketCatalog,
): ProviderRole | undefined {
  const bucketRow = bucketCatalog
    ? findBucketByName(bucketCatalog, config.providerConnectionId, config.bucketName)
    : undefined;
  return findStorageRole(catalog, {
    providerConnectionId: config.providerConnectionId,
    accessLevel: grant.accessLevel as never,
    ...(bucketRow ? { bucketId: bucketRow.id } : {}),
  });
}

/** The provider-connection attributes plus the resolved role's, as a `ConnectionProvider`. */
function connectionProviderFor(
  catalog: ProviderCatalog,
  config: { providerConnectionId: string },
  storageRole: ProviderRole,
): ConnectionProvider {
  const providerConnection = findProviderConnection(catalog, config.providerConnectionId);
  if (!providerConnection) throw new Error("Provider connection is absent from the catalog");
  return {
    providerType: providerConnection.providerType,
    endpoint: providerConnection.endpoint,
    region: providerConnection.region,
    roleArn: storageRole.roleArn,
    allowedScopes: storageRole.allowedScopes,
    accessLevel: storageRole.accessLevel,
  };
}

/**
 * Resolve the best `ApplyTarget` across ALL connections on a bucket: prefer a
 * connection that has an Admin-level grant (so the `PutBucketPolicy` write
 * succeeds); fall back to the supplied `fallback` connection when no Admin-level
 * role is found on any connection. This lets a read-only share succeed — the
 * write session borrows an Admin-level role from another connection the acting
 * user has on the same bucket.
 */
function resolveApplyTargetFromSet(
  configs: ConnectionConfigWithGrants[],
  fallback: ConnectionConfigWithGrants,
  catalog: ProviderCatalog,
  bucketCatalog?: BucketCatalog,
):
  | { ok: true; target: ApplyTarget; connectionProvider: ConnectionProvider }
  | {
      ok: false;
      error: string;
    } {
  for (const config of configs) {
    for (const grant of config.grants) {
      const storageRole = findStorageRoleForConfig(catalog, config, grant, bucketCatalog);
      if (storageRole?.accessLevel !== "admin") continue;
      const connectionProvider = connectionProviderFor(catalog, config, storageRole);
      return {
        ok: true,
        connectionProvider,
        target: {
          organization: config.organization,
          bucketName: config.bucketName,
          region: connectionProvider.region,
          endpoint: connectionProvider.endpoint,
          roleArn: connectionProvider.roleArn,
        },
      };
    }
  }

  return resolveApplyTargetFromCatalog(fallback, catalog, bucketCatalog);
}

function resolveApplyTargetFromCatalog(
  config: ConnectionConfigWithGrants,
  catalog: ProviderCatalog,
  bucketCatalog?: BucketCatalog,
):
  | { ok: true; target: ApplyTarget; connectionProvider: ConnectionProvider }
  | {
      ok: false;
      error: string;
    } {
  const resolvedGrants = config.grants
    .map((grant) => ({
      grant,
      storageRole: findStorageRoleForConfig(catalog, config, grant, bucketCatalog),
    }))
    .filter((g): g is { grant: ConnectionGrant; storageRole: ProviderRole } =>
      Boolean(g.storageRole),
    );

  if (resolvedGrants.length === 0) {
    return {
      ok: false,
      error:
        "This connection references a provider connection or role that is no longer available. Ask an administrator to check the storage onboarding.",
    };
  }

  const chosen =
    resolvedGrants.find((g) => g.storageRole.accessLevel === "admin") ?? resolvedGrants[0];

  const connectionProvider = connectionProviderFor(catalog, config, chosen.storageRole);
  return {
    ok: true,
    connectionProvider,
    target: {
      organization: config.organization,
      bucketName: config.bucketName,
      region: connectionProvider.region,
      endpoint: connectionProvider.endpoint,
      roleArn: connectionProvider.roleArn,
    },
  };
}

export type ApplyGrantOutcome =
  | { status: "applied"; result: ApplyResult }
  | { status: "drifted"; warning: string; result: ApplyResult }
  | { status: "error"; warning: string };

/** The bucket a managed grant set is assembled over. */
export interface BucketRef {
  organization: string;
  providerConnectionId: string;
  bucketName: string;
}

/**
 * Recompute the full managed grant set for `bucket` from its persisted
 * connections' grants and apply it under `applyVia`'s provider role. `applyVia`
 * only supplies the write-session role and region — it need not live on the
 * bucket anymore (the old-bucket revoke after a bucket move passes the pre-move
 * refs).
 */
export async function applyBucketGrantSet(
  bucket: BucketRef,
  applyVia: ConnectionConfigWithGrants,
  acting: ActingContext,
): Promise<ApplyGrantOutcome> {
  if (process.env.BYPASS_GRANT_APPLY === "1") {
    return { status: "applied", result: { status: "applied" } };
  }

  let catalog;
  try {
    catalog = await getProviderCatalog(bucket.organization, acting.accessToken);
  } catch (error) {
    return {
      status: "error",
      warning: error instanceof Error ? error.message : "Provider catalog is unavailable.",
    };
  }

  const configs = await prisma.connectionConfig.findMany({
    where: bucket,
    include: { grants: true },
  });
  const bucketCatalog = await bucketCatalogFor(bucket.organization, acting.accessToken);
  const grants = assembleBucketGrants(configs, catalog, bucketCatalog);

  const targetResult = resolveApplyTargetFromSet(configs, applyVia, catalog, bucketCatalog);
  if (!targetResult.ok) {
    return { status: "error", warning: targetResult.error };
  }

  try {
    const result = await applyBucketPolicy(
      targetResult.target,
      grants,
      acting.idToken,
      acting.user.name,
    );
    if (result.status === "warning") {
      return {
        status: "drifted",
        warning: result.warning ?? "Bucket policy could not be applied.",
        result,
      };
    }
    return { status: "applied", result };
  } catch (error) {
    return {
      status: "error",
      warning:
        error instanceof Error
          ? error.message
          : "The bucket policy could not be applied. Access remains governed by the existing bucket policy.",
    };
  }
}

/**
 * The apply step every connection mutation shares: recompute + apply the bucket's
 * grant set and persist the outcome on the connection row's `bucketPolicyStatus`.
 */
export async function applyGrantsAndRecordStatus(
  config: ConnectionConfigWithGrants,
  acting: ActingContext,
): Promise<ApplyGrantOutcome> {
  if (process.env.BYPASS_GRANT_APPLY === "1") {
    await prisma.connectionConfig.update({
      where: { id: config.id },
      data: { bucketPolicyStatus: "applied" },
    });
    return { status: "applied", result: { status: "applied" } };
  }

  const outcome = await applyBucketGrantSet(
    {
      organization: config.organization,
      providerConnectionId: config.providerConnectionId,
      bucketName: config.bucketName,
    },
    config,
    acting,
  );

  await prisma.connectionConfig.update({
    where: { id: config.id },
    data: { bucketPolicyStatus: outcome.status },
  });

  return outcome;
}
