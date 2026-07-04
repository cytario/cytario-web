/**
 * Bucket-policy generator.
 *
 * Compiles a share grant -- a (target-group scope, access level, prefix) tuple --
 * into the managed statements of an S3 bucket policy, and read-merge-writes them
 * into a live policy document while PRESERVING every foreign statement.
 *
 * Security invariants (non-negotiable):
 *  - Every Allow statement carries `aws:PrincipalTag/ORG == <org alias>` AND the
 *    per-group condition `aws:PrincipalTag/<org-relative-group-path> == "1"`. The
 *    generator REFUSES to emit any Allow lacking the ORG condition (fail closed).
 *  - Managed statements carry a stable `Sid` prefixed `Cytario` so they are
 *    mergeable and revocable, while foreign statements are left untouched.
 *  - The coalesced document must fit the 20480-byte bucket-policy ceiling; on
 *    overflow the apply fails closed with no partial write.
 *
 * This module shares NO policy-construction code with `buildSessionPolicy`
 * (`app/.server/auth/sessionPolicy.ts`); each generator independently carries the
 * ORG condition (the CI architectural-separation test asserts this).
 */

/** Hard S3 limit on a bucket policy document. Fail closed above it. */
export const BUCKET_POLICY_MAX_BYTES = 20480;

/** Every managed statement's `Sid` starts with this so foreign statements are distinguishable. */
export const MANAGED_SID_PREFIX = "Cytario";

export type AccessLevel = "read-only" | "read-write";

/**
 * A single share grant to realize on the bucket policy. `groupPath` is the
 * organization-relative group path (leading slash stripped, e.g. `Lab/TeamX`) --
 * the identical key the principal-tag mapper emits and the session policy would
 * never touch.
 */
export interface BucketPolicyGrant {
  organization: string;
  bucketName: string;
  groupPath: string;
  prefix: string | null | undefined;
  accessLevel: AccessLevel;
}

/** Read actions granted at every access level. */
const READ_ACTIONS = ["s3:GetObject"] as const;
/** Bucket-level list action (scoped by the `s3:prefix` Condition, not by Resource ARN). */
const LIST_ACTION = "s3:ListBucket";
/** Additional write actions granted only for read-write access. */
const WRITE_ACTIONS = ["s3:PutObject", "s3:DeleteObject"] as const;

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

/**
 * Deterministic, collision-resistant suffix for a managed `Sid`. Derived from the
 * grant's stable identity (org, group, prefix, access) so re-applying the same
 * grant converges to the same `Sid` -- the property idempotency and revoke rely on.
 * Uses a small non-cryptographic hash (FNV-1a) rendered hex; a `Sid` must match
 * `[A-Za-z0-9]+`, so no separators.
 */
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

/** True iff a statement is one this module manages (identified purely by `Sid` prefix). */
export const isManagedStatement = (statement: PolicyStatement): boolean =>
  typeof statement.Sid === "string" && statement.Sid.startsWith(MANAGED_SID_PREFIX);

/**
 * Build the `Condition` block shared by every statement of a grant: the ORG tag
 * plus the per-group tag. This is the fail-closed heart of the generator -- a grant
 * without an organization cannot produce a condition and must never be emitted.
 */
const buildGrantCondition = (grant: BucketPolicyGrant): PolicyCondition => {
  if (!grant.organization) {
    throw new Error("Bucket-policy grant is missing an organization (fail closed).");
  }
  if (!grant.groupPath) {
    throw new Error("Bucket-policy grant is missing a target group path (fail closed).");
  }
  return {
    StringEquals: {
      "aws:PrincipalTag/ORG": grant.organization,
      [`aws:PrincipalTag/${grant.groupPath}`]: "1",
    },
  };
};

/**
 * Compile one grant into its managed statements:
 *  - a `ListBucket` statement scoped to the prefix via `s3:prefix` (bucket-level
 *    action cannot be Resource-scoped), and
 *  - an object statement (`GetObject`, plus write actions for read-write) scoped
 *    to the prefix via the Resource ARN.
 *
 * Prefixes are trailing-slash anchored: `<prefix>/` and
 * `<prefix>/*` for the list condition and `<prefix>/*` for the object ARN, so a
 * grant on `foo` cannot leak sibling keys `foobar`, `foo-other`.
 */
export const compileGrantStatements = (grant: BucketPolicyGrant): PolicyStatement[] => {
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

  const listCondition: PolicyCondition = prefix
    ? { ...condition, StringLike: { "s3:prefix": [`${prefix}/`, `${prefix}/*`] } }
    : condition;

  const listStatement: PolicyStatement = {
    Sid: `${sidStem}List`,
    Effect: "Allow",
    Action: LIST_ACTION,
    Resource: bucketArn,
    Condition: listCondition,
  };

  const objectActions =
    grant.accessLevel === "read-write" ? [...READ_ACTIONS, ...WRITE_ACTIONS] : [...READ_ACTIONS];

  const objectStatement: PolicyStatement = {
    Sid: `${sidStem}Object`,
    Effect: "Allow",
    Action: objectActions.length === 1 ? objectActions[0] : objectActions,
    Resource: objectArn,
    Condition: condition,
  };

  return [listStatement, objectStatement];
};

/**
 * Assert that every statement in a set carries the ORG condition. Called on the
 * managed statements before they are merged in, so a generation fault (an Allow
 * without the tenant binding) fails closed rather than widening the policy.
 */
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

/**
 * Coalesce managed statements to stay under the size ceiling: merge statements
 * that are identical except for their `Resource` into one statement with a
 * multi-value `Resource` list, and fold a read-only object statement into a
 * read-write object statement for the same (group, prefix). Foreign statements
 * are never coalesced.
 *
 * Two managed statements are coalescible when their `Effect`, `Action` set, and
 * `Condition` are identical; their `Resource` values are then unioned. Coalescing
 * changes the `Sid` to a stable digest of the merged content so re-applying stays
 * idempotent.
 */
const coalesceManaged = (statements: PolicyStatement[]): PolicyStatement[] => {
  const groups = new Map<string, PolicyStatement>();
  const order: string[] = [];

  for (const statement of statements) {
    const key = canonicalize({ ...statement, Sid: undefined, Resource: undefined });
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, { ...statement, Resource: toResourceArray(statement.Resource) });
      order.push(key);
    } else {
      const merged = new Set([
        ...toResourceArray(existing.Resource),
        ...toResourceArray(statement.Resource),
      ]);
      existing.Resource = [...merged];
    }
  }

  return order.map((key) => {
    const statement = groups.get(key)!;
    const resources = toResourceArray(statement.Resource);
    const normalizedResource = resources.length === 1 ? resources[0] : resources.sort();
    const withResource = { ...statement, Resource: normalizedResource };
    const sidStem = `${MANAGED_SID_PREFIX}Share${fnv1aHex(canonicalize({ ...withResource, Sid: undefined }))}`;
    return { ...withResource, Sid: sidStem };
  });
};

const toResourceArray = (resource: PolicyStatement["Resource"] | undefined): string[] =>
  resource === undefined ? [] : Array.isArray(resource) ? resource : [resource];

/**
 * Canonicalize a JSON value: sort object keys and sort every string array so two
 * semantically-equal statements serialize byte-identically. The coalescing key.
 */
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

/**
 * Parse a live bucket policy document (the string `GetBucketPolicy` returns), or
 * the empty policy when the bucket has none. Throws on a malformed document so the
 * caller fails closed rather than clobbering an unparseable policy.
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

export interface BuildResult {
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
 *  3. assert every managed Allow is ORG-conditioned (fail closed),
 *  4. enforce the 20480-byte ceiling (fail closed on overflow).
 *
 * Passing an empty `grants` array removes all managed statements (full revoke).
 */
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

/**
 * A foreign statement whose `Sid` collides with our managed prefix is a generation
 * fault: we cannot tell it apart from a statement we own, so we fail closed rather
 * than risk clobbering or double-counting it.
 */
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
