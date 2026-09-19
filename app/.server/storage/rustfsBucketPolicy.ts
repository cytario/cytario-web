/**
 * RustFS bucket-policy generator.
 *
 * The RustFS counterpart of `bucketPolicy.ts` (the AWS generator). Compiles a
 * share grant — a (target-group scope, access level, prefix) tuple — into the
 * managed statements of an S3-compatible bucket policy on a RustFS-backed
 * bucket, read-merge-writing them into the live document while preserving
 * every foreign statement.
 *
 * Binding model (the deliberate difference from the AWS variant):
 *  - RustFS has no session tags and no `aws:PrincipalTag` condition keys, and
 *    its multivalued `jwt:groups` condition keys evaluate `ForAnyValue` (and
 *    unqualified set semantics) as ANY-match — a condition listing several
 *    independent values is OR'd, so an org marker and a group path must never
 *    be separate values of one condition.
 *  - The org keycloak mapper therefore emits each org-scoped group as the
 *    single composite claim value `<org-marker>/<org-relative-group-path>`
 *    (e.g. `cytario-org-acme/Lab/TeamX`), and this generator conditions each
 *    group-scoped grant on exactly that one composite value. The organization
 *    binding is AND-by-construction: the composite names both the org and the
 *    group, and a foreign organization's session cannot produce another org's
 *    composite because the mapper derives it from the session's own active
 *    organization. An org-root grant (`groupPath === ORG_ROOT_SCOPE`)
 *    conditions on the bare org marker alone — every member of the org holds
 *    it, and it is reserved (a foreign org's session never carries it).
 *  - The org admission itself is bound at the storage layer by the per-org IAM
 *    policy attached to the marker-named IAM group (customer-managed per the
 *    operator runbook); this generator only narrows resources and actions
 *    within it.
 *
 * Security invariants (mirroring the AWS generator, adapted to RustFS's
 * vocabulary):
 *  - Every Allow statement carries a `StringEquals` `jwt:groups` condition
 *    whose every value contains the org marker (`cytario-org-<alias>`) — the
 *    composite for group-scoped grants, the bare marker for org-root grants.
 *    The generator REFUSES to emit any Allow lacking the org binding
 *    (fail closed).
 *  - Managed statements carry a stable `Sid` prefixed `Cytario` so they remain
 *    mergeable and revocable, while foreign statements are left untouched.
 *  - The coalesced document must fit the 20480-byte bucket-policy ceiling; on
 *    overflow the apply fails closed with no partial write.
 *
 * Protocol-level constants, types, and pure utilities are shared with the AWS
 * generator through `policyPrimitives.ts` — facts of the S3 wire protocol that
 * carry no binding semantics. The separation test forbids cross-imports of the
 * generator *modules*; sharing protocol primitives does not weaken it. What
 * stays deliberately unshared: condition construction, statement compilation,
 * and coalescing (the AWS variant unions Principals across grants; RustFS's
 * principal is the constant federated wildcard, so only Resources union).
 */

import {
  type AccessLevel,
  BUCKET_METADATA_ACTIONS,
  BUCKET_POLICY_MAX_BYTES,
  type BucketPolicyDocument,
  type PolicyStatement,
  READ_ACTIONS,
  WRITE_ACTIONS,
  fnv1aHex,
  isManagedStatement,
  parseBucketPolicy as parsePolicyDocument,
  stripSlashes,
} from "./policyPrimitives";
import { ORG_ROOT_SCOPE } from "~/utils/authorization";

/** Reserved prefix of the org marker the rustfs-groups mapper emits. */
export const ORG_MARKER_PREFIX = "cytario-org-";

export type { AccessLevel, BucketPolicyDocument, PolicyStatement };
export { isManagedStatement };
export const parseBucketPolicy = parsePolicyDocument;

/**
 * A single share grant to realize on the bucket policy. `groupPath` is the
 * organization-relative group path (leading slash stripped, e.g. `Lab/TeamX`)
 * or the `ORG_ROOT_SCOPE` sentinel (`*`) for an org-wide grant.
 */
export interface RustfsBucketPolicyGrant {
  kind: "rustfs";
  organization: string;
  bucketName: string;
  groupPath: string;
  prefix: string | null | undefined;
  accessLevel: AccessLevel;
}

/** The org marker value for an organization alias. */
export const orgMarkerFor = (organization: string): string => `${ORG_MARKER_PREFIX}${organization}`;

/**
 * The composite binding value for a group-scoped grant: the org marker prefix
 * joined to the grantee group's org-relative path. Single-valued by
 * construction, so the `StringEquals` condition cannot be OR'd apart.
 */
export const compositeGroupValue = (organization: string, groupPath: string): string =>
  `${orgMarkerFor(organization)}/${groupPath}`;

const managedSidStem = (grant: RustfsBucketPolicyGrant): string => {
  const prefix = stripSlashes(grant.prefix ?? "");
  const identity = [grant.organization, grant.groupPath, prefix, grant.accessLevel].join("\u0000");
  return `CytarioShare${fnv1aHex(identity)}`;
};

/**
 * Build the `Condition` block shared by every statement of a grant: a
 * `StringEquals` `jwt:groups` condition on exactly ONE value — the composite
 * `<org-marker>/<group-path>` for a group-scoped grant (org + group bound
 * together, immune to any-match evaluation), the bare org marker for an
 * org-root grant. Fail-closed on a missing organization or group path.
 */
const buildGrantCondition = (grant: RustfsBucketPolicyGrant) => {
  if (!grant.organization) {
    throw new Error("Bucket-policy grant is missing an organization (fail closed).");
  }
  if (!grant.groupPath) {
    throw new Error("Bucket-policy grant is missing a target group path (fail closed).");
  }
  const value =
    grant.groupPath === ORG_ROOT_SCOPE
      ? orgMarkerFor(grant.organization)
      : compositeGroupValue(grant.organization, grant.groupPath);
  return {
    StringEquals: {
      "jwt:groups": value,
    },
  } as const;
};

/**
 * Compile one grant into its managed statements: a prefix-scoped `ListBucket`
 * statement, a bucket-metadata statement, and object statements per access
 * level — structurally identical to the AWS generator's output so the
 * behavioral contract carries over; only the condition vocabulary differs.
 */
export const compileGrantStatements = (grant: RustfsBucketPolicyGrant): PolicyStatement[] => {
  if (!grant.bucketName) {
    throw new Error("Bucket-policy grant is missing a bucket name (fail closed).");
  }
  const prefix = stripSlashes(grant.prefix ?? "");
  if (/[*?]/.test(prefix)) {
    throw new Error("Bucket-policy grant prefix may not contain wildcard characters (`*`, `?`).");
  }

  const condition = buildGrantCondition(grant);
  const bucketArn = `arn:aws:s3:::${grant.bucketName}`;
  const objectArn = prefix ? `${bucketArn}/${prefix}/*` : `${bucketArn}/*`;
  const sidStem = managedSidStem(grant);

  // RustFS federated sessions carry no ARN identities — the mapped-policy set
  // IS the principal. The composite condition alone binds the statements to
  // the org and group, which is the same authority the role-ARN Principal
  // carried on AWS.
  const principal = { AWS: "*" };

  const listCondition: Record<string, Record<string, string | string[]>> = prefix
    ? { ...condition, StringLike: { "s3:prefix": [`${prefix}/`, `${prefix}/*`] } }
    : { ...condition };

  const listStatement: PolicyStatement = {
    Sid: `${sidStem}List`,
    Effect: "Allow",
    Principal: principal,
    Action: "s3:ListBucket",
    Resource: bucketArn,
    Condition: listCondition,
  };

  const bucketMetadataStatement: PolicyStatement = {
    Sid: `${sidStem}BucketMeta`,
    Effect: "Allow",
    Principal: principal,
    Action: [...BUCKET_METADATA_ACTIONS],
    Resource: bucketArn,
    Condition: { ...condition },
  };

  const statements: PolicyStatement[] = [listStatement, bucketMetadataStatement];

  // Object-level actions depend on the access level. Read Only → GetObject
  // only. Annotate → GetObject + PutObject scoped to sidecar files
  // (*.annotations.*.json and settings.*.json at any directory depth —
  // separate statements with narrower Resources) + DeleteObject scoped to
  // annotation sidecars (set deletion). Read Write / Admin →
  // GetObject + the full write + multipart action set on the whole prefix.
  if (grant.accessLevel === "annotate") {
    statements.push({
      Sid: `${sidStem}Object`,
      Effect: "Allow",
      Principal: principal,
      Action: READ_ACTIONS[0],
      Resource: objectArn,
      Condition: { ...condition },
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
      Principal: principal,
      Action: "s3:PutObject",
      Resource: [annotationResource, settingsBaseResource, settingsNestedResource],
      Condition: { ...condition },
    });
    // Annotation-set deletion: the viewer deletes a set's whole sidecar file.
    // Scoped to the annotation pattern — settings sidecars stay put-only.
    statements.push({
      Sid: `${sidStem}AnnotateDelete`,
      Effect: "Allow",
      Principal: principal,
      Action: "s3:DeleteObject",
      Resource: annotationResource,
      Condition: { ...condition },
    });
  } else {
    const isWriteLevel = grant.accessLevel === "read-write" || grant.accessLevel === "admin";
    const objectActions = isWriteLevel ? [...READ_ACTIONS, ...WRITE_ACTIONS] : [...READ_ACTIONS];
    statements.push({
      Sid: `${sidStem}Object`,
      Effect: "Allow",
      Principal: principal,
      Action: objectActions.length === 1 ? objectActions[0] : objectActions,
      Resource: objectArn,
      Condition: { ...condition },
    });
  }

  return statements;
};

/**
 * Assert that every managed Allow statement's `jwt:groups` condition carries
 * the org binding — every listed value contains the org marker — so a
 * generation fault fails closed rather than widening the policy.
 */
const assertOrgConditioned = (statements: PolicyStatement[]): void => {
  for (const statement of statements) {
    if (statement.Effect !== "Allow") continue;
    const groups = statement.Condition?.StringEquals?.["jwt:groups"];
    const values = Array.isArray(groups) ? groups : groups !== undefined ? [groups] : [];
    const carriesMarker =
      values.length > 0 && values.every((value) => value.startsWith(ORG_MARKER_PREFIX));
    if (!carriesMarker) {
      throw new Error(
        `Refusing to emit managed bucket-policy statement '${statement.Sid ?? "(no Sid)"}' without the org-bound jwt:groups condition (fail closed).`,
      );
    }
  }
};

/** Structural key two statements must share to be coalesced into one. */
const coalesceKeyOf = (statement: PolicyStatement): string => {
  const conditionKeys = statement.Condition
    ? Object.fromEntries(
        Object.entries(statement.Condition)
          .map(([op, kv]) => [
            op,
            kv
              ? Object.fromEntries(
                  Object.entries(kv).map(([k, v]) => [k, Array.isArray(v) ? [...v].sort() : v]),
                )
              : {},
          ])
          .sort(([a], [b]) => (a < b ? -1 : 1)),
      )
    : {};
  return JSON.stringify([
    statement.Effect,
    statement.Action,
    conditionKeys,
    Array.isArray(statement.Resource) ? [...statement.Resource].sort() : statement.Resource,
  ]);
};

/**
 * Coalesce managed statements to stay under the size ceiling: merge statements
 * that are identical except for their `Resource` into one statement with a
 * multi-value `Resource`. The AWS generator also unions Principals; here the
 * principal is the constant federated wildcard, so only Resource merges.
 * Foreign statements are never coalesced.
 */
const coalesceManaged = (statements: PolicyStatement[]): PolicyStatement[] => {
  const groups = new Map<string, PolicyStatement>();
  const order: string[] = [];

  for (const statement of statements) {
    const key = coalesceKeyOf(statement);
    const existing = groups.get(key);
    if (existing) {
      const resources = new Set(
        Array.isArray(existing.Resource) ? existing.Resource : [existing.Resource],
      );
      for (const resource of Array.isArray(statement.Resource)
        ? statement.Resource
        : [statement.Resource]) {
        resources.add(resource);
      }
      existing.Resource = resources.size === 1 ? [...resources][0] : [...resources];
    } else {
      groups.set(key, { ...statement });
      order.push(key);
    }
  }

  return order.map((key) => groups.get(key)) as PolicyStatement[];
};

export interface RustfsBuildResult {
  /** The full merged policy document, foreign statements preserved. */
  document: BucketPolicyDocument;
  /** Serialized document (what `PutBucketPolicy` receives). */
  serialized: string;
  /** The managed statements after coalescing. */
  managedStatements: PolicyStatement[];
}

/**
 * Read-merge-write core. Produce the policy to apply from the live policy plus
 * the desired grant set:
 *  1. keep every foreign statement verbatim,
 *  2. replace ALL managed statements with the coalesced compilation of `grants`,
 *  3. assert every managed Allow is org-conditioned (fail closed),
 *  4. enforce the 20480-byte ceiling (fail closed on overflow).
 *
 * Passing an empty `grants` array removes all managed statements (full revoke).
 */
export const buildMergedPolicy = (
  livePolicy: BucketPolicyDocument,
  grants: RustfsBucketPolicyGrant[],
): RustfsBuildResult => {
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

/**
 * A foreign statement whose `Sid` collides with our managed prefix is a
 * generation fault: we cannot tell it apart from a statement we own, so we
 * fail closed rather than risk clobbering or double-counting it.
 */
const assertNoManagedSidCollision = (foreign: PolicyStatement[]): void => {
  for (const statement of foreign) {
    if (isManagedStatement(statement)) {
      throw new Error(
        `Foreign statement '${statement.Sid}' collides with the managed Sid prefix (fail closed).`,
      );
    }
  }
};
