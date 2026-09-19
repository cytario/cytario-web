// Bucket-policy generator. Every managed Allow carries the ORG principal-tag
// condition (fail closed); an org-root grant carries only the ORG condition since
// Keycloak does not emit a `*` principal tag. Managed statements carry a stable
// `Sid` prefixed `Cytario`; foreign statements are preserved verbatim. Shares no
// policy-construction code with sessionPolicy.ts — each generator independently
// carries the ORG condition (the CI separation test asserts this).

import { ORG_ROOT_SCOPE } from "~/utils/authorization";
import { type AccessLevel } from "~/utils/providerCatalog.schema";

/** Hard S3 limit on a bucket policy document. */
export const BUCKET_POLICY_MAX_BYTES = 20480;

/** Managed statement `Sid`s start with this; foreign statements are left untouched. */
export const MANAGED_SID_PREFIX = "Cytario";

export type { AccessLevel };

/**
 * `groupPath` is the organization-relative group path, or the `ORG_ROOT_SCOPE`
 * sentinel (`*`) for an org-wide grant, which carries only the ORG condition.
 */
export interface BucketPolicyGrant {
  organization: string;
  bucketName: string;
  groupPath: string;
  prefix: string | null | undefined;
  accessLevel: AccessLevel;
  // The Principal of the grant's statements — never the apply write-session's role.
  roleArn?: string;
}

/** Read actions granted at every access level. */
const READ_ACTIONS = ["s3:GetObject"] as const;
/** ListBucket is bucket-level: scoped by the `s3:prefix` Condition, not by Resource ARN. */
const LIST_ACTION = "s3:ListBucket";
// Metadata reads every S3 client issues on connect; they reveal bucket
// metadata, not object data, so they are granted at every access level.
const BUCKET_METADATA_ACTIONS = [
  "s3:GetBucketLocation",
  "s3:ListBucketMultipartUploads",
  "s3:GetBucketOwnershipControls",
] as const;
// Write + multipart actions for read-write/admin. `s3:CompleteMultipartUpload`
// is an API operation, not an IAM action key — S3 rejects it in a policy with
// "Policy has invalid action"; completing an upload is authorized by PutObject.
const WRITE_ACTIONS = [
  "s3:PutObject",
  "s3:DeleteObject",
  "s3:AbortMultipartUpload",
  "s3:ListMultipartUploadParts",
] as const;

export interface PolicyCondition {
  StringEquals?: Record<string, string>;
  StringLike?: Record<string, string[]>;
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

const stripSlashes = (value: string): string => value.replace(/^\/+|\/+$/g, "");

/** Deterministic suffix from the grant's stable identity so re-applying converges to the same `Sid` (idempotency and revoke rely on it). */
const fnv1aHex = (input: string): string => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
};

/** The two logical statements a grant compiles to share this managed-`Sid` stem. */
const managedSidStem = (grant: BucketPolicyGrant): string => {
  const prefix = stripSlashes(grant.prefix ?? "");
  const identity = [grant.organization, grant.groupPath, prefix, grant.accessLevel].join("\u0000");
  return `${MANAGED_SID_PREFIX}Share${fnv1aHex(identity)}`;
};

/** True iff a statement is managed here (identified purely by `Sid` prefix). */
export const isManagedStatement = (statement: PolicyStatement): boolean =>
  typeof statement.Sid === "string" && statement.Sid.startsWith(MANAGED_SID_PREFIX);

// Fail-closed heart of the generator: a grant without an organization must never
// be emitted. An org-root grant carries ONLY the ORG condition: Keycloak does not
// emit a `*` principal tag, so a per-group condition would never match and break
// the connection; the ORG tag alone is the correct boundary for an org-wide grant.
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

const EMPTY_POLICY: BucketPolicyDocument = { Version: "2012-10-17", Statement: [] };

// Throws on a malformed document so the caller fails closed rather than
// clobbering an unparseable policy; an absent policy yields the empty policy.
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
