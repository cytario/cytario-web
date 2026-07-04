import { ConnectionConfig } from "~/.generated/client";
import type { UserProfile } from "~/.server/auth/getUserInfo";
import { prisma } from "~/.server/db/prisma";
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
}

/**
 * A connection contributes a managed bucket-policy grant only when it is scoped to
 * a real group — a personal (owner-sub) or org-root (`*`) connection maps to no
 * per-group principal tag and therefore emits no managed statement (every managed
 * Allow is keyed on the per-group tag). The share/connection is still created and
 * browsable via the inline session policy; it simply carries no managed
 * bucket-policy delta.
 */
export function connectionIsGroupScoped(config: { scope: string }, userSub: string): boolean {
  return config.scope !== userSub && config.scope !== ORG_ROOT_SCOPE;
}

/**
 * The default access level for a generated grant. The provider-role catalog does
 * not yet carry an explicit grantee access level (it exposes only `allowsSharing`,
 * the `s3:PutBucketPolicy` capability), so grants are generated read-only — the
 * fail-safe floor (never grant more than intended). When the catalog gains an
 * explicit access-level field, thread it here.
 */
const DEFAULT_ACCESS_LEVEL = "read-only" as const;

/** Build the managed bucket-policy grant a single group-scoped connection intends. */
export function grantForConnection(config: {
  organization: string;
  bucketName: string;
  scope: string;
  prefix: string;
}): BucketPolicyGrant {
  return {
    organization: config.organization,
    bucketName: config.bucketName,
    groupPath: config.scope,
    prefix: config.prefix,
    accessLevel: DEFAULT_ACCESS_LEVEL,
  };
}

/**
 * Assemble the FULL desired managed grant set for a bucket in the active org from
 * its persisted connections. Grants derive from already-persisted rows — each row
 * was authorized against its submitted scope when it was created or updated; no
 * additional per-row authorization happens here. Passing the full set to
 * `applyBucketPolicy` makes the write idempotent and makes un-share fall out
 * naturally — a removed connection is simply absent from the set.
 */
export function assembleBucketGrants(
  configs: ConnectionConfig[],
  userSub: string,
): BucketPolicyGrant[] {
  return configs
    .filter((c) => connectionIsGroupScoped(c, userSub))
    .map((c) => grantForConnection(c));
}

export type ValidatedProviderRefs =
  | { ok: true; providerConnection: ProviderConnection; providerRole: ProviderRole }
  | { ok: false; errors: Record<string, string[]> };

/**
 * Validate a submitted provider connection + role reference against the catalog:
 * both ids must exist, the role must belong to the connection, a share must use a
 * sharing-capable role, and the role's allowed scopes must cover the submitted
 * scope. The client-side selector filtering is advisory only — this is the
 * authoritative check on the submitted values.
 */
export function validateProviderRefs(
  catalog: ProviderCatalog,
  refs: { providerConnectionId: string; providerRoleId: string; scope: string },
  options: { requireSharing?: boolean } = {},
): ValidatedProviderRefs {
  const providerConnection = findProviderConnection(catalog, refs.providerConnectionId);
  if (!providerConnection) {
    return { ok: false, errors: { providerConnectionId: ["Unknown provider connection"] } };
  }

  const providerRole = findProviderRole(catalog, refs.providerRoleId);
  if (!providerRole || providerRole.providerConnectionId !== providerConnection.id) {
    return { ok: false, errors: { providerRoleId: ["Unknown provider role for this connection"] } };
  }

  if (options.requireSharing && !providerRole.allowsSharing) {
    return { ok: false, errors: { providerRoleId: ["This role cannot be used to share"] } };
  }

  if (!providerRole.allowedScopes.some((allowed) => adminCovers(allowed, refs.scope))) {
    return {
      ok: false,
      errors: { providerRoleId: ["This role does not cover the chosen scope"] },
    };
  }

  return { ok: true, providerConnection, providerRole };
}

/** Resolve a connection to its `ApplyTarget` via the org provider catalog. */
export async function resolveApplyTarget(
  config: ConnectionConfig,
): Promise<
  | { ok: true; target: ApplyTarget; resolved: ResolvedConnectionProvider }
  | { ok: false; error: string }
> {
  let catalog;
  try {
    catalog = await getProviderCatalog(config.organization);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Provider catalog is unavailable.",
    };
  }

  const resolved = resolveConnectionProvider(catalog, config);
  if (!resolved) {
    return {
      ok: false,
      error:
        "This connection references a provider connection or role that is no longer available. Ask an administrator to check the storage onboarding.",
    };
  }

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
  config: ConnectionConfig,
  bucketGrants: BucketPolicyGrant[],
  acting: ActingContext,
): Promise<ApplyGrantOutcome> {
  const targetResult = await resolveApplyTarget(config);
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
 * connections and apply it under `applyVia`'s provider role. `applyVia` only
 * supplies the write-session role and region — it need not live on the bucket
 * anymore (the old-bucket revoke after a bucket move passes the pre-move refs).
 */
export async function applyBucketGrantSet(
  bucket: BucketRef,
  applyVia: ConnectionConfig,
  acting: ActingContext,
): Promise<ApplyGrantOutcome> {
  const configs = await prisma.connectionConfig.findMany({ where: bucket });
  const grants = assembleBucketGrants(configs, acting.user.sub);
  return applyConnectionGrants(applyVia, grants, acting);
}

/**
 * The apply step every connection mutation shares: recompute + apply the bucket's
 * grant set and persist the outcome on the connection row's `bucketPolicyStatus`.
 */
export async function applyGrantsAndRecordStatus(
  config: ConnectionConfig,
  acting: ActingContext,
): Promise<ApplyGrantOutcome> {
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
