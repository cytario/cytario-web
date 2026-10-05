/**
 * Inline session policy for the RustFS variant of the credential mint —
 * the counterpart of `sessionPolicy.ts` (the AWS variant).
 *
 * RustFS applies the `Policy` parameter of AssumeRoleWithWebIdentity as a
 * filter over the mapped per-org policy set, exactly as AWS applies it over
 * the role's attached policy. Unlike AWS's parser, RustFS's rejects any
 * non-ARN resource (`Resource: "*"` parses as `type: 'unknown'` and fails the
 * whole mint), so the AWS-only KMS statements — the one construct that needs
 * a bare `*` — are absent here: RustFS has no KMS, the mapped admission
 * policy is the entitlement, and the S3 statements carry proper bucket/object
 * ARNs only.
 *
 * Shares no construction code with the other policy generators (independence
 * rule).
 */

import { InlinePolicySizeError, POLICY_SIZE_CEILING } from "./inlinePolicySize";

/** Duplicated to keep the session-policy and bucket-policy generators import-disjoint. */
type AccessLevel = "read-only" | "annotate" | "read-write" | "admin";

export { InlinePolicySizeError, POLICY_SIZE_CEILING };

export interface RustfsSessionPolicyArgs {
  bucketName: string;
  prefix: string | null | undefined;
  // Lower levels omit prefix-wide PutObject so the STS session itself denies
  // writes — defense-in-depth, not just a UI gate.
  accessLevel: AccessLevel;
}

const stripSlashes = (prefix: string): string => prefix.replace(/^\/+|\/+$/g, "");

/** Builds the object ARN `bucket/<prefix>/*` (or the whole bucket when no prefix). */
const objectArn = (bucketArn: string, prefix: string): string =>
  [bucketArn, prefix, "*"].filter(Boolean).join("/");

// No-prefix listing must OMIT the `s3:prefix` condition: the S3 layer evaluates
// an absent prefix parameter as "", which StringLike "*" does not match.
function listBucketStatement(bucketArn: string, prefixes: string[], sid: string) {
  const hasPrefix = prefixes.length > 0;

  return hasPrefix
    ? {
        Sid: sid,
        Effect: "Allow",
        Action: "s3:ListBucket",
        Resource: bucketArn,
        Condition: {
          StringLike: {
            "s3:prefix": prefixes.flatMap((p) => [`${p}/`, `${p}/*`]),
          },
        },
      }
    : {
        Sid: sid,
        Effect: "Allow",
        Action: "s3:ListBucket",
        Resource: bucketArn,
      };
}

/** GetObject scoped to a prefix via the Resource ARN (or the whole bucket when no prefix). */
function getObjectStatement(bucketArn: string, prefix: string) {
  return {
    Sid: "GetObjectScopedToPrefix",
    Effect: "Allow",
    Action: "s3:GetObject",
    Resource: objectArn(bucketArn, prefix),
  };
}

// Sidecar PutObject for the annotate level only — per-user scoping is by
// filename convention (the UUID in the key), not IAM enforcement.
// read-write/admin get the broader prefix grant instead.
function getPutOwnSidecarStatement(bucketArn: string, prefix: string) {
  const annotationArn = [bucketArn, prefix, `*.annotations.*.json`].filter(Boolean).join("/");
  const settingsArnBase = [bucketArn, prefix, `settings.*.json`].filter(Boolean).join("/");
  const settingsArnNested = [bucketArn, prefix, `*/settings.*.json`].filter(Boolean).join("/");

  return {
    Sid: "PutOwnSidecars",
    Effect: "Allow",
    Action: "s3:PutObject",
    Resource: [annotationArn, settingsArnBase, settingsArnNested],
  };
}

// Annotation-sidecar DeleteObject for every level that can write sidecars: the
// read-write/admin prefix grant carries PutObject only, so they need this too.
function getDeleteSidecarStatement(bucketArn: string, prefix: string) {
  const annotationArn = [bucketArn, prefix, `*.annotations.*.json`].filter(Boolean).join("/");

  return {
    Sid: "DeleteAnnotationSidecars",
    Effect: "Allow",
    Action: "s3:DeleteObject",
    Resource: annotationArn,
  };
}

/** `PutObject` scoped to a prefix via the Resource ARN — read-write/admin only. */
function getPutObjectStatement(bucketArn: string, prefix: string) {
  return {
    Sid: "PutObjectScopedToPrefix",
    Effect: "Allow",
    Action: "s3:PutObject",
    Resource: objectArn(bucketArn, prefix),
  };
}

/** Whether the access level permits writes to the connection data plane. */
const permitsPrefixWrite = (accessLevel: AccessLevel): boolean =>
  accessLevel === "read-write" || accessLevel === "admin";

const permitsSidecarWrite = (accessLevel: AccessLevel): boolean => accessLevel !== "read-only";

/** Build the RustFS inline IAM session policy for `AssumeRoleWithWebIdentityCommand`. */
export const buildRustfsSessionPolicy = ({
  bucketName,
  prefix: prefixRaw,
  accessLevel,
}: RustfsSessionPolicyArgs): string => {
  if (!bucketName) {
    throw new Error("Bucket name is required to build a session policy (fail closed).");
  }
  if (/[*?]/.test(bucketName)) {
    throw new Error("Bucket name may not contain wildcard characters (`*`, `?`).");
  }

  const prefix = stripSlashes(prefixRaw ?? "");

  // Defense-in-depth: refuse wildcards here so the schema is not the only gate
  // protecting cross-tenant `StringLike` conditions.
  if (/[*?]/.test(prefix)) {
    throw new Error("Prefix may not contain IAM wildcard characters (`*`, `?`)");
  }

  const bucketArn = `arn:aws:s3:::${bucketName}`;

  const statements: Array<{
    Sid: string;
    Effect: string;
    Action: string;
    Resource: string | string[];
    Condition?: Record<string, Record<string, string | string[]>>;
  }> = [
    listBucketStatement(
      bucketArn,
      prefix ? [prefix] : [],
      prefix ? "ListBucketScopedToPrefix" : "ListBucketWholeBucket",
    ),
    getObjectStatement(bucketArn, prefix),
  ];

  // The prefix grant (read-write/admin) subsumes the sidecar scope, so emit the
  // narrower sidecar statement only when the session cannot write the prefix.
  if (permitsSidecarWrite(accessLevel) && !permitsPrefixWrite(accessLevel)) {
    statements.push(getPutOwnSidecarStatement(bucketArn, prefix));
  }

  // Annotation-set deletion for every level that can write sidecars.
  if (permitsSidecarWrite(accessLevel)) {
    statements.push(getDeleteSidecarStatement(bucketArn, prefix));
  }

  if (permitsPrefixWrite(accessLevel)) {
    statements.push(getPutObjectStatement(bucketArn, prefix));
  }

  // Construction-time invariant: RustFS's parser fails the whole mint on any
  // non-ARN resource (and rejects non-S3 actions it cannot resolve), so pin
  // the shape here — fail closed rather than emit a policy the mint rejects.
  const isArn = (resource: string): boolean =>
    resource.startsWith(`${bucketArn}`) || /^arn:aws:s3:::/.test(resource);
  for (const statement of statements) {
    const actions = [statement.Action].flat();
    if (actions.some((action) => !action.startsWith("s3:"))) {
      throw new Error(
        "RustFS session policy drifted from the pinned S3-only action invariant (fail closed).",
      );
    }
    const resources = [statement.Resource].flat();
    if (resources.some((resource) => !isArn(resource))) {
      throw new Error(
        "RustFS session policy drifted from the pinned ARN-resource invariant (fail closed).",
      );
    }
  }

  // Compact JSON (no insignificant whitespace) — the size check must reflect
  // the serialized form actually sent.
  const serialized = JSON.stringify({ Version: "2012-10-17", Statement: statements });

  if (serialized.length > POLICY_SIZE_CEILING) {
    throw new InlinePolicySizeError(serialized.length, POLICY_SIZE_CEILING);
  }

  return serialized;
};
