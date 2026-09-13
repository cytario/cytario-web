/**
 * RustFS bucket-policy generator.
 *
 * The RustFS counterpart of `bucketPolicy.ts` (the AWS generator). Compiles a
 * share grant — a (target-group scope, access level, prefix) tuple — into the
 * managed statements of an S3-compatible bucket policy on a RustFS-backed
 * bucket, read-merge-writing them into the live document while preserving
 * every foreign statement.
 *
 * Security invariants (mirroring the AWS generator, adapted to RustFS's
 * authorization vocabulary):
 *  - RustFS has no session tags and no `aws:PrincipalTag` condition keys. The
 *    tenant binding is the `jwt:groups` condition: every Allow statement
 *    carries `ForAnyValue:StringEquals { "jwt:groups": [...] }` naming the
 *    org marker (`cytario-org-<alias>`, the value the cytario-keycloak
 *    rustfs-groups mapper emits and the ARWWI mint propagates into the session
 *    token) and, for a group-scoped grant, the grantee group's org-relative
 *    path. An org-root grant (`groupPath === ORG_ROOT_SCOPE`) carries only the
 *    org marker — every member of the org holds it.
 *  - The org admission itself is bound at the storage layer by the per-org IAM
 *    policy the operator attaches to the marker-named IAM group; this
 *    generator only narrows resources and actions within it.
 *  - Managed statements carry a stable `Sid` prefixed `Cytario` so they remain
 *    mergeable and revocable, while foreign statements are left untouched.
 *  - The coalesced document must fit the 20480-byte bucket-policy ceiling; on
 *    overflow the apply fails closed with no partial write.
 *
 * This module shares NO policy-construction code with the AWS generator in
 * `bucketPolicy.ts` nor with `buildSessionPolicy` — the independence rule the
 * architectural CI test asserts for the AWS pair applies identically here.
 */

import { ORG_ROOT_SCOPE } from "~/utils/authorization";

/** Hard S3-family limit on a bucket-policy document. Fail closed above it. */
export const BUCKET_POLICY_MAX_BYTES = 20480;

/** Every managed statement's `Sid` starts with this so foreign statements differ. */
export const MANAGED_SID_PREFIX = "Cytario";

/** Reserved prefix of the org marker the rustfs-groups mapper emits. */
export const ORG_MARKER_PREFIX = "cytario-org-";

/** Read actions granted at every access level. */
const READ_ACTIONS = ["s3:GetObject"] as const;
/** Bucket-level list action (scoped by the `s3:prefix` Condition, not Resource ARN). */
const LIST_ACTION = "s3:ListBucket";
/** Bucket-level metadata reads every S3 client issues on connect. */
const BUCKET_METADATA_ACTIONS = [
  "s3:GetBucketLocation",
  "s3:ListBucketMultipartUploads",
  "s3:GetBucketOwnershipControls",
] as const;
/** Write + multipart actions granted for read-write / admin access. */
const WRITE_ACTIONS = [
  "s3:PutObject",
  "s3:DeleteObject",
  "s3:AbortMultipartUpload",
  "s3:ListMultipartUploadParts",
] as const;

export type RustfsAccessLevel = "read-only" | "annotate" | "read-write" | "admin";

export interface PolicyCondition {
  StringEquals?: Record<string, string | string[]>;
  StringLike?: Record<string, string[]>;
  "ForAnyValue:StringEquals"?: Record<string, string | string[]>;
  [operator: string]: Record<string, string | string[]> | undefined;
}

export interface PolicyStatement {
  Sid?: string;
  Effect: "Allow" | "Deny";
  Principal?: unknown;
  Action: string | string[];
  Resource: string | string[];
  Condition?: PolicyCondition;
  [key: string]: unknown;
}

export interface BucketPolicyDocument {
  Version: string;
  Id?: string;
  Statement: PolicyStatement[];
}

/**
 * A single share grant to realize on the bucket policy. `groupPath` is the
 * organization-relative group path (leading slash stripped, e.g. `Lab/TeamX`)
 * or the `ORG_ROOT_SCOPE` sentinel (`*`) for an org-wide grant.
 */
export interface RustfsBucketPolicyGrant {
  organization: string;
  bucketName: string;
  groupPath: string;
  prefix: string | null | undefined;
  accessLevel: RustfsAccessLevel;
}

const stripSlashes = (value: string): string => value.replace(/^\/+|\/+$/g, "");

const fnv1aHex = (input: string): string => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
};

const managedSidStem = (grant: RustfsBucketPolicyGrant): string => {
  const prefix = stripSlashes(grant.prefix ?? "");
  const identity = [grant.organization, grant.groupPath, prefix, grant.accessLevel].join("\u0000");
  return `${MANAGED_SID_PREFIX}Share${fnv1aHex(identity)}`;
};

/** True iff a statement is one this module manages (identified by `Sid` prefix). */
export const isManagedStatement = (statement: PolicyStatement): boolean =>
  typeof statement.Sid === "string" && statement.Sid.startsWith(MANAGED_SID_PREFIX);

/** The org marker value for an organization alias. */
export const orgMarkerFor = (organization: string): string => `${ORG_MARKER_PREFIX}${organization}`;

/**
 * Build the `Condition` block shared by every statement of a grant. The org
 * marker is the fail-closed tenant binding — a grant without an organization
 * must never be emitted. A group-scoped grant additionally requires the
 * grantee group's org-relative path (both values ride the same `jwt:groups`
 * multivalued claim; `ForAnyValue` matches when the session carries at least
 * one listed value, and both entries come from the same token so the pairing
 * holds).
 */
const buildGrantCondition = (grant: RustfsBucketPolicyGrant): PolicyCondition => {
  if (!grant.organization) {
    throw new Error("Bucket-policy grant is missing an organization (fail closed).");
  }
  if (!grant.groupPath) {
    throw new Error("Bucket-policy grant is missing a target group path (fail closed).");
  }
  if (grant.groupPath === ORG_ROOT_SCOPE) {
    return {
      "ForAnyValue:StringEquals": {
        "jwt:groups": [orgMarkerFor(grant.organization)],
      },
    };
  }
  return {
    "ForAnyValue:StringEquals": {
      "jwt:groups": [orgMarkerFor(grant.organization), grant.groupPath],
    },
  };
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
  // IS the principal. The conditions alone bind the statements to the org and
  // group, which is the same authority the role-ARN Principal carried on AWS.
  const principal = { AWS: "*" };

  const listCondition: PolicyCondition = prefix
    ? { ...condition, StringLike: { "s3:prefix": [`${prefix}/`, `${prefix}/*`] } }
    : condition;

  const listStatement: PolicyStatement = {
    Sid: `${sidStem}List`,
    Effect: "Allow",
    Principal: principal,
    Action: LIST_ACTION,
    Resource: bucketArn,
    Condition: listCondition,
  };

  const bucketMetadataStatement: PolicyStatement = {
    Sid: `${sidStem}BucketMeta`,
    Effect: "Allow",
    Principal: principal,
    Action: [...BUCKET_METADATA_ACTIONS],
    Resource: bucketArn,
    Condition: condition,
  };

  const statements: PolicyStatement[] = [listStatement, bucketMetadataStatement];

  if (grant.accessLevel === "annotate") {
    statements.push({
      Sid: `${sidStem}Object`,
      Effect: "Allow",
      Principal: principal,
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
      Principal: principal,
      Action: "s3:PutObject",
      Resource: [annotationResource, settingsBaseResource, settingsNestedResource],
      Condition: condition,
    });
    statements.push({
      Sid: `${sidStem}AnnotateDelete`,
      Effect: "Allow",
      Principal: principal,
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
      Principal: principal,
      Action: objectActions.length === 1 ? objectActions[0] : objectActions,
      Resource: objectArn,
      Condition: condition,
    });
  }

  return statements;
};

/**
 * Assert that every managed Allow statement carries the org-marker condition —
 * the RustFS analogue of the AWS generator's ORG-condition assertion, so a
 * generation fault fails closed rather than widening the policy.
 */
const assertOrgConditioned = (statements: PolicyStatement[]): void => {
  for (const statement of statements) {
    if (statement.Effect !== "Allow") continue;
    const groups = statement.Condition?.["ForAnyValue:StringEquals"]?.["jwt:groups"];
    const carriesMarker =
      Array.isArray(groups) && groups.some((value) => value.startsWith(ORG_MARKER_PREFIX));
    if (!carriesMarker) {
      throw new Error(
        `Refusing to emit managed bucket-policy statement '${statement.Sid ?? "(no Sid)"}' without the org-marker jwt:groups condition (fail closed).`,
      );
    }
  }
};

/** Structural key two statements must share to be coalesced into one. */
const coalesceKeyOf = (statement: PolicyStatement): string =>
  JSON.stringify([
    statement.Effect,
    statement.Action,
    statement.Condition,
    Array.isArray(statement.Resource) ? [...statement.Resource].sort() : statement.Resource,
  ]);

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

const EMPTY_POLICY: BucketPolicyDocument = { Version: "2012-10-17", Statement: [] };

/**
 * Parse a live bucket-policy document, or the empty policy when the bucket has
 * none. Throws on a malformed document so the caller fails closed rather than
 * clobbering an unparseable policy.
 */
export const parseBucketPolicy = (raw: string | null | undefined): BucketPolicyDocument => {
  if (!raw) return { ...EMPTY_POLICY, Statement: [] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Live bucket policy is not valid JSON; refusing to overwrite (fail closed).");
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    !Array.isArray((parsed as BucketPolicyDocument).Statement)
  ) {
    throw new Error(
      "Live bucket policy has no Statement array; refusing to overwrite (fail closed).",
    );
  }
  const doc = parsed as BucketPolicyDocument;
  return {
    Version: doc.Version || "2012-10-17",
    ...(doc.Id ? { Id: doc.Id } : {}),
    Statement: doc.Statement,
  };
};

export interface RustfsBuildResult {
  document: BucketPolicyDocument;
  serialized: string;
  managedStatements: PolicyStatement[];
}

/**
 * Read-merge-write core, identical in shape to the AWS generator's
 * `buildMergedPolicy`: keep every foreign statement verbatim, replace all
 * managed statements with the coalesced compilation of `grants`, assert every
 * managed Allow is org-conditioned (fail closed), and enforce the size
 * ceiling. An empty `grants` array removes all managed statements (revoke).
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

const assertNoManagedSidCollision = (foreign: PolicyStatement[]): void => {
  for (const statement of foreign) {
    if (isManagedStatement(statement)) {
      throw new Error(
        `Foreign statement '${statement.Sid}' collides with the managed Sid prefix (fail closed).`,
      );
    }
  }
};
