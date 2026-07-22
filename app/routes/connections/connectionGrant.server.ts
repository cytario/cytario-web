import type { ConnectionConfig, ConnectionGrant } from "~/.generated/client";
import type { UserProfile } from "~/.server/auth/getUserInfo";
import { prisma } from "~/.server/db/prisma";
import { findBucketByName, getBucketCatalog } from "~/.server/providers/bucketCatalog.server";
import {
  type ResolvedConnectionProvider,
  findProviderConnection,
  findProviderRole,
  getProviderCatalog,
  resolveConnectionProvider,
} from "~/.server/providers/providerCatalog.server";
import { type BucketPolicyGrant } from "~/.server/storage/bucketPolicy";
import {
  type ApplyResult,
  type ApplyTarget,
  applyBucketPolicy,
} from "~/.server/storage/bucketPolicyApply.server";
import { cytarioConfig } from "~/config";
import { ORG_ROOT_SCOPE, adminCovers } from "~/utils/authorization";
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
 * The default access level for a generated grant. The provider-role catalog does
 * not yet carry an explicit grantee access level (it exposes only `allowsSharing`,
 * the `s3:PutBucketPolicy` capability), so grants are generated read-only — the
 * fail-safe floor (never grant more than intended). When the catalog gains an
 * explicit access-level field, thread it here.
 */
const DEFAULT_ACCESS_LEVEL = "read-only" as const;

/**
 * Build the managed bucket-policy grant a single grant row intends. The grant's
 * `providerRoleId` is resolved to a concrete role ARN by the caller (via the
 * provider catalog) and injected onto the `BucketPolicyGrant` so the fail-closed
 * policy generator accepts it.
 */
export function grantForConnection(
  config: { organization: string; bucketName: string; prefix: string },
  grant: { scope: string },
  roleArn: string,
): BucketPolicyGrant {
  return {
    organization: config.organization,
    bucketName: config.bucketName,
    groupPath: grant.scope,
    prefix: config.prefix,
    accessLevel: DEFAULT_ACCESS_LEVEL,
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
 * Each grant's `providerRoleId` is resolved against the catalog to a concrete role
 * ARN; grants whose role reference is stale (absent from the catalog) are skipped
 * — they cannot contribute a Principal and would fail the generator.
 */
export function assembleBucketGrants(
  configs: ConnectionConfigWithGrants[],
  catalog: ProviderCatalog,
): BucketPolicyGrant[] {
  const grants: BucketPolicyGrant[] = [];
  for (const config of configs) {
    for (const grant of config.grants) {
      const resolved = resolveConnectionProvider(catalog, {
        providerConnectionId: config.providerConnectionId,
        providerRoleId: grant.providerRoleId,
      });
      if (!resolved) continue;
      grants.push(grantForConnection(config, grant, resolved.roleArn));
    }
  }
  return grants;
}

export type ValidatedProviderRefs =
  | { ok: true; providerConnection: ProviderConnection; providerRoles: ProviderRole[] }
  | { ok: false; errors: Record<string, string[]> };

/**
 * Validate submitted provider connection + grant references against the catalog:
 * the provider connection must exist, every grant's provider role must exist and
 * belong to that connection, a share must use sharing-capable roles, and each
 * grant's role's allowed scopes must cover the grant's scope (an org-wide role
 * with empty `allowedScopes` covers any scope). The client-side selector filtering
 * is advisory only — this is the authoritative check on the submitted values.
 */
export function validateProviderRefs(
  catalog: ProviderCatalog,
  refs: { providerConnectionId: string; grants: Array<{ providerRoleId: string; scope: string }> },
  options: { requireSharing?: boolean } = {},
): ValidatedProviderRefs {
  const providerConnection = findProviderConnection(catalog, refs.providerConnectionId);
  if (!providerConnection) {
    return { ok: false, errors: { providerConnectionId: ["Unknown provider connection"] } };
  }

  const providerRoles: ProviderRole[] = [];
  const errors: Record<string, string[]> = {};
  for (const [index, grant] of refs.grants.entries()) {
    const providerRole = findProviderRole(catalog, grant.providerRoleId);
    if (!providerRole || providerRole.providerConnectionId !== providerConnection.id) {
      errors[`grants.${index}.providerRoleId`] = ["Unknown provider role for this connection"];
      continue;
    }

    if (options.requireSharing && !providerRole.allowsSharing) {
      errors[`grants.${index}.providerRoleId`] = ["This role cannot be used to share"];
      continue;
    }

    const isOrgWide = providerRole.allowedScopes.length === 0;
    if (
      grant.scope !== ORG_ROOT_SCOPE &&
      !isOrgWide &&
      !providerRole.allowedScopes.some((allowed) => adminCovers(allowed, grant.scope))
    ) {
      errors[`grants.${index}.providerRoleId`] = ["This role does not cover the chosen scope"];
      continue;
    }

    providerRoles.push(providerRole);
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
  | { ok: true }
  | { ok: false; errors: Record<string, string[]> }
  | { ok: false; formError: string };

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
 * write session runs under a grant whose provider role allows sharing (write
 * access); when none of the grants' roles allows sharing, the first resolvable
 * grant's role is used as a best-effort fallback. The acting user must
 * administer the connection (canModify) before this is called.
 */
export async function resolveApplyTarget(
  config: ConnectionConfigWithGrants,
  accessToken: string,
): Promise<
  | { ok: true; target: ApplyTarget; resolved: ResolvedConnectionProvider }
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

  return resolveApplyTargetFromCatalog(config, catalog);
}

/**
 * Resolve the best `ApplyTarget` across ALL connections on a bucket: prefer a
 * connection that has a sharing-capable grant (so the `PutBucketPolicy` write
 * succeeds); fall back to the supplied `fallback` connection when no
 * sharing-capable role is found on any connection. This lets a read-only share
 * succeed — the write session borrows a sharing-capable role from another
 * connection the acting user has on the same bucket.
 */
function resolveApplyTargetFromSet(
  configs: ConnectionConfigWithGrants[],
  fallback: ConnectionConfigWithGrants,
  catalog: ProviderCatalog,
):
  | { ok: true; target: ApplyTarget; resolved: ResolvedConnectionProvider }
  | {
      ok: false;
      error: string;
    } {
  for (const config of configs) {
    for (const grant of config.grants) {
      const resolved = resolveConnectionProvider(catalog, {
        providerConnectionId: config.providerConnectionId,
        providerRoleId: grant.providerRoleId,
      });
      if (resolved?.allowsSharing) {
        return {
          ok: true,
          resolved,
          target: {
            organization: config.organization,
            bucketName: config.bucketName,
            region: resolved.region,
            endpoint: resolved.endpoint,
            roleArn: resolved.roleArn,
          },
        };
      }
    }
  }

  return resolveApplyTargetFromCatalog(fallback, catalog);
}

function resolveApplyTargetFromCatalog(
  config: ConnectionConfigWithGrants,
  catalog: ProviderCatalog,
):
  | { ok: true; target: ApplyTarget; resolved: ResolvedConnectionProvider }
  | {
      ok: false;
      error: string;
    } {
  const resolvedGrants = config.grants
    .map((grant) => ({
      grant,
      resolved: resolveConnectionProvider(catalog, {
        providerConnectionId: config.providerConnectionId,
        providerRoleId: grant.providerRoleId,
      }),
    }))
    .filter((g): g is { grant: ConnectionGrant; resolved: ResolvedConnectionProvider } =>
      Boolean(g.resolved),
    );

  if (resolvedGrants.length === 0) {
    return {
      ok: false,
      error:
        "This connection references a provider connection or role that is no longer available. Ask an administrator to check the storage onboarding.",
    };
  }

  const chosen = resolvedGrants.find((g) => g.resolved.allowsSharing) ?? resolvedGrants[0];

  const { resolved } = chosen;
  return {
    ok: true,
    resolved,
    target: {
      organization: config.organization,
      bucketName: config.bucketName,
      region: resolved.region,
      endpoint: resolved.endpoint,
      roleArn: resolved.roleArn,
    },
  };
}

export type ApplyGrantOutcome =
  | { status: "applied"; result: ApplyResult }
  | { status: "drifted"; warning: string; result: ApplyResult }
  | { status: "error"; warning: string };

/**
 * Apply the desired managed grant set for the bucket a connection lives on, under
 * the acting user's connection provider-role write session. `bucketGrants` is the
 * full desired managed set for that bucket. Degradation is two-level and never
 * blocks the connection/share record:
 *  - `drifted`: the write itself was refused (`s3:PutBucketPolicy` denied) — the
 *    live policy is known to diverge from the intended grant set;
 *  - `error`: the apply could not run at all (catalog unavailable, generation
 *    fault, lock or STS failure).
 * Neither outcome ever claims the grant was enforced.
 */
export async function applyConnectionGrants(
  config: ConnectionConfigWithGrants,
  bucketGrants: BucketPolicyGrant[],
  acting: ActingContext,
): Promise<ApplyGrantOutcome> {
  const targetResult = await resolveApplyTarget(config, acting.accessToken);
  if (!targetResult.ok) {
    return { status: "error", warning: targetResult.error };
  }

  try {
    const result = await applyBucketPolicy(
      targetResult.target,
      bucketGrants,
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
  const grants = assembleBucketGrants(configs, catalog);

  const targetResult = resolveApplyTargetFromSet(configs, applyVia, catalog);
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
