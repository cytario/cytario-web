/**
 * Bucket-policy generator.
 *
 * Compiles a share grant -- a (target-group scope, access level, prefix) tuple --
 * into the managed statements of an S3 bucket policy, and read-merge-writes them
 * into a live policy document while PRESERVING every foreign statement.
 *
 * Security invariants (non-negotiable):
 *  - Every Allow statement carries the `aws:PrincipalTag/ORG == <org alias>`
 *    condition. An intra-org-group grant additionally carries the per-group
 *    condition `aws:PrincipalTag/<org-relative-group-path> == "1"`; an org-root
 *    grant (`groupPath === ORG_ROOT_SCOPE`, shared with the whole organization)
 *    carries ONLY the ORG condition, since Keycloak does not emit a `*` principal
 *    tag. The generator REFUSES to emit any Allow lacking the ORG condition
 *    (fail closed).
 *  - Managed statements carry a stable `Sid` prefixed `Cytario` so they are
 *    mergeable and revocable, while foreign statements are left untouched.
 *  - The coalesced document must fit the 20480-byte bucket-policy ceiling; on
 *    overflow the apply fails closed with no partial write.
 *
 * This module shares NO policy-construction code with `buildSessionPolicy`
 * (`app/.server/auth/sessionPolicy.ts`); each generator independently carries the
 * ORG condition (the CI architectural-separation test asserts this).
 *
 * Protocol-level constants, types, and pure utilities (S3 action sets, the size
 * ceiling, the managed-Sid prefix, document parsing) are shared with the RustFS
 * generator through `policyPrimitives.ts` — wire-protocol facts with no binding
 * semantics. The separation test forbids cross-imports of the generator
 * *modules*; primitives are not the generators.
 */

import {
  type AccessLevel,
  BUCKET_METADATA_ACTIONS,
  type PolicyCondition,
  BUCKET_POLICY_MAX_BYTES,
  LIST_ACTION,
  MANAGED_SID_PREFIX,
  READ_ACTIONS,
  WRITE_ACTIONS,
  type BucketPolicyDocument,
  type PolicyStatement,
  fnv1aHex,
  isManagedStatement,
  parseBucketPolicy as parsePolicyDocument,
  stripSlashes,
} from "./policyPrimitives";
import { ORG_ROOT_SCOPE } from "~/utils/authorization";

export { BUCKET_POLICY_MAX_BYTES, MANAGED_SID_PREFIX, isManagedStatement };
export type { AccessLevel, BucketPolicyDocument, PolicyCondition, PolicyStatement };

/**
 * `groupPath` is the organization-relative group path, or the `ORG_ROOT_SCOPE`
 * sentinel (`*`) for an org-wide grant, which carries only the ORG condition.
 */
export interface BucketPolicyGrant {
  /** Explicit provider discriminator — the apply's homogeneity guard keys on
   *  it, never on incidental optional fields. */
  kind: "aws";
  organization: string;
  bucketName: string;
  groupPath: string;
  prefix: string | null | undefined;
  accessLevel: AccessLevel;
  // The Principal of the grant's statements — never the apply write-session's role.
  roleArn?: string;
}

const managedSidStem = (grant: BucketPolicyGrant): string => {
  const prefix = stripSlashes(grant.prefix ?? "");
  const identity = [grant.organization, grant.groupPath, prefix, grant.accessLevel].join("\u0000");
  return `${MANAGED_SID_PREFIX}Share${fnv1aHex(identity)}`;
};

/**
 * Build the `Condition` block shared by every statement of a grant: the ORG tag
 * plus the per-group tag. This is the fail-closed heart of the generator -- a grant
 * without an organization cannot produce a condition and must never be emitted.
 *
 * An org-root grant (`groupPath === ORG_ROOT_SCOPE`, i.e. shared with the whole
 * organization) carries ONLY the ORG condition: Keycloak does not emit a `*`
 * principal tag, so an `aws:PrincipalTag/*` condition would never match and
 * break the connection. Every member of the active org already carries the ORG
 * tag, so the ORG condition alone is the correct boundary for an org-wide grant.
 */
const buildGrantCondition = (grant: BucketPolicyGrant): PolicyCondition => {
  if (!grant.organization) {
    throw new Error("Bucket-policy grant is missing an organization (fail closed).");
  }
  if (!grant.groupPath) {
    throw new Error("Bucket-policy grant is missing a target group path (fail closed).");
  }
  if (grant.groupPath === ORG_ROOT_SCOPE) {
    return {
      StringEquals: {
        "aws:PrincipalTag/ORG": grant.organization,
      },
    };
  }
  return {
    StringEquals: {
      "aws:PrincipalTag/ORG": grant.organization,
      [`aws:PrincipalTag/${grant.groupPath}`]: "1",
    },
  };
};

// Prefixes are trailing-slash anchored (`<prefix>/` and `<prefix>/*`) so a grant
// on `foo` cannot leak sibling keys `foobar`, `foo-other`. ListBucket is scoped
// via `s3:prefix` (bucket-level actions cannot be Resource-scoped).
export const compileGrantStatements = (grant: BucketPolicyGrant): PolicyStatement[] => {
  if (!grant.bucketName) {
    throw new Error("Bucket-policy grant is missing a bucket name (fail closed).");
  }
  if (!grant.roleArn) {
    throw new Error(
      "Bucket-policy grant is missing a roleArn — it must be injected by applyBucketPolicy before compilation.",
    );
  }
  const prefix = stripSlashes(grant.prefix ?? "");
  if (/[*?]/.test(prefix)) {
    throw new Error("Bucket-policy grant prefix may not contain wildcard characters (`*`, `?`).");
  }

  const condition = buildGrantCondition(grant);
  const bucketArn = `arn:aws:s3:::${grant.bucketName}`;
  const objectArn = prefix ? `${bucketArn}/${prefix}/*` : `${bucketArn}/*`;
  const sidStem = managedSidStem(grant);

  const listCondition: PolicyCondition = prefix
    ? { ...condition, StringLike: { "s3:prefix": [`${prefix}/`, `${prefix}/*`] } }
    : condition;

  const listStatement: PolicyStatement = {
    Sid: `${sidStem}List`,
    Effect: "Allow",
    Principal: { AWS: grant.roleArn },
    Action: LIST_ACTION,
    Resource: bucketArn,
    Condition: listCondition,
  };

  const bucketMetadataStatement: PolicyStatement = {
    Sid: `${sidStem}BucketMeta`,
    Effect: "Allow",
    Principal: { AWS: grant.roleArn },
    Action: [...BUCKET_METADATA_ACTIONS],
    Resource: bucketArn,
    Condition: condition,
  };

  const statements: PolicyStatement[] = [listStatement, bucketMetadataStatement];

  // Annotate scopes PutObject to sidecar files (*.annotations.*.json and
  // settings.*.json at any depth) plus DeleteObject scoped to annotation sidecars
  // (set deletion); settings sidecars stay put-only.
  if (grant.accessLevel === "annotate") {
    statements.push({
      Sid: `${sidStem}Object`,
      Effect: "Allow",
      Principal: { AWS: grant.roleArn },
      Action: READ_ACTIONS[0],
      Resource: objectArn,
      Condition: condition,
    });
    const annotationResource = prefix
      ? `${bucketArn}/${prefix}/*.annotations.*.json`
      : `${bucketArn}/*.annotations.*.json`;
    const settingsBaseResource = prefix
      ? `${bucketArn}/${prefix}/settings.*.json`
      : `${bucketArn}/settings.*.json`;
    const settingsNestedResource = prefix
      ? `${bucketArn}/${prefix}/*/settings.*.json`
      : `${bucketArn}/*/settings.*.json`;
    statements.push({
      Sid: `${sidStem}Annotate`,
      Effect: "Allow",
      Principal: { AWS: grant.roleArn },
      Action: "s3:PutObject",
      Resource: [annotationResource, settingsBaseResource, settingsNestedResource],
      Condition: condition,
    });
    statements.push({
      Sid: `${sidStem}AnnotateDelete`,
      Effect: "Allow",
      Principal: { AWS: grant.roleArn },
      Action: "s3:DeleteObject",
      Resource: annotationResource,
      Condition: condition,
    });
  } else {
    const isWriteLevel = grant.accessLevel === "read-write" || grant.accessLevel === "admin";
    const objectActions = isWriteLevel ? [...READ_ACTIONS, ...WRITE_ACTIONS] : [...READ_ACTIONS];
    statements.push({
      Sid: `${sidStem}Object`,
      Effect: "Allow",
      Principal: { AWS: grant.roleArn },
      Action: objectActions.length === 1 ? objectActions[0] : objectActions,
      Resource: objectArn,
      Condition: condition,
    });
  }

  return statements;
};

// A generation fault (an Allow without the tenant binding) fails closed here
// rather than widening the policy.
const assertOrgConditioned = (statements: PolicyStatement[]): void => {
  for (const statement of statements) {
    if (statement.Effect !== "Allow") continue;
    const org = statement.Condition?.StringEquals?.["aws:PrincipalTag/ORG"];
    if (!org) {
      throw new Error(
        `Refusing to emit managed bucket-policy statement '${statement.Sid ?? "(no Sid)"}' without an aws:PrincipalTag/ORG condition (fail closed).`,
      );
    }
  }
};

// Merge statements identical except `Resource`/`Principal` into one with unioned
// arrays (the Sid is re-digested from merged content so re-applying stays
// idempotent); grants to different groups are never merged (their per-group tag
// conditions differ). Foreign statements are never coalesced.
const coalesceManaged = (statements: PolicyStatement[]): PolicyStatement[] => {
  const groups = new Map<string, PolicyStatement>();
  const order: string[] = [];

  for (const statement of statements) {
    const key = canonicalize({
      ...statement,
      Sid: undefined,
      Resource: undefined,
      Principal: undefined,
    });
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        ...statement,
        Resource: toResourceArray(statement.Resource),
        Principal: { AWS: toPrincipalArray(statement.Principal) },
      });
      order.push(key);
    } else {
      const mergedResources = new Set([
        ...toResourceArray(existing.Resource),
        ...toResourceArray(statement.Resource),
      ]);
      existing.Resource = [...mergedResources];
      const mergedPrincipals = new Set([
        ...toPrincipalArray(existing.Principal),
        ...toPrincipalArray(statement.Principal),
      ]);
      existing.Principal = { AWS: [...mergedPrincipals] };
    }
  }

  return order.map((key) => {
    const statement = groups.get(key)!;
    const resources = toResourceArray(statement.Resource);
    const normalizedResource = resources.length === 1 ? resources[0] : resources.sort();
    const principals = toPrincipalArray(statement.Principal);
    const normalizedPrincipal = principals.length === 1 ? principals[0] : principals.sort();
    const withNormalized = {
      ...statement,
      Resource: normalizedResource,
      Principal: { AWS: normalizedPrincipal },
    };
    const sidStem = `${MANAGED_SID_PREFIX}Share${fnv1aHex(canonicalize({ ...withNormalized, Sid: undefined }))}`;
    return { ...withNormalized, Sid: sidStem };
  });
};

const toResourceArray = (resource: PolicyStatement["Resource"] | undefined): string[] =>
  resource === undefined ? [] : Array.isArray(resource) ? resource : [resource];

// Unknown principal shapes contribute nothing to the union (and fail to coalesce).
const toPrincipalArray = (principal: PolicyStatement["Principal"] | undefined): string[] => {
  if (!principal || typeof principal !== "object") return [];
  const aws = (principal as { AWS?: string | string[] }).AWS;
  if (!aws) return [];
  return Array.isArray(aws) ? aws : [aws];
};

/** Sort object keys and every string array so semantically-equal statements serialize byte-identically. */
export const canonicalize = (value: unknown): string => {
  const normalize = (input: unknown): unknown => {
    if (Array.isArray(input)) {
      const items = input.map(normalize);
      if (items.every((i) => typeof i === "string")) {
        return [...(items as string[])].sort();
      }
      return items;
    }
    if (input && typeof input === "object") {
      const record = input as Record<string, unknown>;
      return Object.keys(record)
        .filter((k) => record[k] !== undefined)
        .sort()
        .reduce<Record<string, unknown>>((acc, key) => {
          acc[key] = normalize(record[key]);
          return acc;
        }, {});
    }
    return input;
  };
  return JSON.stringify(normalize(value));
};

export const parseBucketPolicy = parsePolicyDocument;

export interface BuildResult {
  /** The full merged policy document, foreign statements preserved. */
  document: BucketPolicyDocument;
  /** Serialized document (what `PutBucketPolicy` receives). */
  serialized: string;
  /** The managed statements after coalescing. */
  managedStatements: PolicyStatement[];
}

// Read-merge-write core: keep every foreign statement verbatim, replace ALL
// managed statements with the coalesced compilation of `grants` (an empty `grants`
// array is a full revoke), and fail closed on any ORG-condition or size-ceiling
// fault.
export const buildMergedPolicy = (
  livePolicy: BucketPolicyDocument,
  grants: BucketPolicyGrant[],
): BuildResult => {
  const foreign = livePolicy.Statement.filter((s) => !isManagedStatement(s));

  const compiled = grants.flatMap(compileGrantStatements);
  assertOrgConditioned(compiled);
  const managedStatements = coalesceManaged(compiled);
  assertOrgConditioned(managedStatements);

  assertNoManagedSidCollision(foreign);

  const document: BucketPolicyDocument = {
    Version: livePolicy.Version || "2012-10-17",
    ...(livePolicy.Id ? { Id: livePolicy.Id } : {}),
    Statement: [...foreign, ...managedStatements],
  };

  const serialized = JSON.stringify(document);
  const byteLength = Buffer.byteLength(serialized, "utf8");
  if (byteLength > BUCKET_POLICY_MAX_BYTES) {
    throw new Error(
      `Merged bucket policy is ${byteLength} bytes, over the ${BUCKET_POLICY_MAX_BYTES}-byte limit; failing closed with no partial apply.`,
    );
  }

  return { document, serialized, managedStatements };
};

// A foreign statement whose `Sid` collides with our managed prefix cannot be
// told apart from one we own — fail closed rather than risk clobbering it.
const assertNoManagedSidCollision = (foreign: PolicyStatement[]): void => {
  // `foreign` already excludes managed statements, so any managed-prefixed Sid
  // here would be a logic error; guard defensively regardless.
  for (const statement of foreign) {
    if (isManagedStatement(statement)) {
      throw new Error(
        `Foreign statement '${statement.Sid}' collides with the managed Sid prefix (fail closed).`,
      );
    }
  }
};
