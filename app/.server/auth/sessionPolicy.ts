/**
 * Builds an inline IAM session policy for `AssumeRoleWithWebIdentityCommand`.
 *
 * STS applies this policy as a **filter**: the effective session permissions are
 * the intersection of the role's attached policy and this inline policy, and an
 * action the inline policy does **not** allow is denied for the session
 * regardless of the role's attached policy. The inline policy must therefore
 * enumerate every action the browser data plane needs — including `kms:Decrypt`
 * for SSE-KMS-encrypted objects (omitting it silently strips the role's grant
 * and breaks `GetObject`). The role's attached policy (and the bucket's KMS key
 * policy) remain the authoritative allowlist of **which** KMS keys the credential
 * may decrypt; the inline `kms:Decrypt` `Resource: "*"` only lets the role's
 * per-key grants flow through the STS intersection — it widens nothing.
 *
 * The ORG tenant binding is enforced by the role's trust policy (and the
 * bucket policy) — it is not repeated here. Keeping the inline policy lean
 * avoids hitting the 2048-character `Policy` limit early.
 *
 * AWS-specific: non-AWS providers (MinIO) may ignore or reject `Policy`;
 * guard the attachment behind `provider === "aws"`.
 */

/** Mirrors `AccessLevel` from providerCatalog.schema — duplicated here to keep
 * the session-policy and bucket-policy generators import-disjoint (ARCH-1). */
type AccessLevel = "read-only" | "annotate" | "read-write" | "admin";

/** Fallback AWS region for the `kms:ViaService` condition when none is supplied. */
const DEFAULT_REGION = "eu-central-1";

/** AWS `AssumeRoleWithWebIdentity` `Policy` parameter ceiling (characters). */
export const POLICY_SIZE_CEILING = 2048;

/**
 * Thrown when the serialized inline session policy would exceed the AWS
 * `AssumeRoleWithWebIdentity` `Policy` parameter ceiling. `fetchTemporaryCredentials`
 * treats this as a connection-level failure — no STS call, no policy-less fallback.
 */
export class InlinePolicySizeError extends Error {
  readonly actualLength: number;
  readonly ceiling: number;

  constructor(actualLength: number, ceiling: number) {
    super(
      `Inline session policy size ceiling exceeded: serialized policy is ${actualLength} characters, ceiling is ${ceiling}.`,
    );
    this.name = "InlinePolicySizeError";
    this.actualLength = actualLength;
    this.ceiling = ceiling;
  }
}

export interface SessionPolicyArgs {
  bucketName: string;
  prefix: string | null | undefined;
  /** Keycloak `sub` of the caller — pins their writable sidecar to their own file. */
  subject: string;
  /** AWS region of the connection's S3 endpoint — scopes the `kms:ViaService` condition. */
  region: string;
  /**
   * Access level of the grant picked for the caller. `"read-write"` or `"admin"`
   * includes the prefix-wide `PutObject`; lower levels omit it so the STS
   * session itself denies writes to the connection data plane —
   * defense-in-depth, not just a UI gate.
   */
  accessLevel: AccessLevel;
}

const stripSlashes = (prefix: string): string => prefix.replace(/^\/+|\/+$/g, "");

/**
 * `ListBucket` scoped to the connection prefix via the `s3:prefix` condition
 * (a bucket-level action can't be scoped by Resource ARN). Empty-prefix listing
 * must omit the `s3:prefix` condition: AWS evaluates an absent `prefix` query
 * parameter as `""`, and `StringLike "*"` does not match it. Allowed values
 * anchor on `/`, otherwise IAM allows `ListBucket prefix=foo` which S3 expands
 * to siblings like `foobar.txt`.
 */
function getListStatement(Resource: string, prefix: string) {
  const hasPrefix = prefix.length > 0;

  return hasPrefix
    ? {
        Sid: "ListBucketScopedToPrefix",
        Effect: "Allow",
        Action: "s3:ListBucket",
        Resource,
        Condition: {
          StringLike: {
            "s3:prefix": [`${prefix}/`, `${prefix}/*`],
          },
        },
      }
    : {
        Sid: "ListBucketWholeBucket",
        Effect: "Allow",
        Action: "s3:ListBucket",
        Resource,
      };
}

/**
 * `GetObject` scoped to the connection prefix via the Resource ARN —
 * `bucket/<prefix>/*`, or the whole bucket when no prefix is set.
 */
function getObjectStatement(bucketArn: string, prefix: string) {
  const objectArn = [bucketArn, prefix, "*"].filter(Boolean).join("/");

  return {
    Sid: "GetObjectScopedToPrefix",
    Effect: "Allow",
    Action: "s3:GetObject",
    Resource: objectArn,
  };
}

/**
 * `PutObject` limited to the caller's OWN annotation sidecars
 * (`*.annotations.<sub>.json`) under the connection prefix — the trailing
 * `<sub>` segment stops a tampered client from writing another user's file
 * (which the cross-user read union would then surface as forged authorship).
 * Overwrite is `PutObject` (full-file write of the user's own file) — no
 * `DeleteObject`.
 *
 * Emitted only for the `annotate` level: `read-only` gets no write at all, and
 * `read-write`/`admin` get the broader prefix grant (see `getPutObjectStatement`)
 * which subsumes this scope — so image data, `offsets.json`, and parquet stay
 * read-only at the `annotate` level, and the inline policy stays lean.
 */
function getPutOwnSidecarStatement(bucketArn: string, prefix: string, subject: string) {
  const sidecarArn = [bucketArn, prefix, `*.annotations.${subject}.json`].filter(Boolean).join("/");

  return {
    Sid: "PutOwnAnnotationSidecars",
    Effect: "Allow",
    Action: "s3:PutObject",
    Resource: sidecarArn,
  };
}

/**
 * `PutObject` scoped to the connection prefix via the Resource ARN —
 * `bucket/<prefix>/*`, or the whole bucket when no prefix is set. Mirrors the
 * `GetObject` scope from `getObjectStatement`.
 *
 * Included only when the caller's grant `accessLevel` is `"read-write"` or
 * `"admin"` — defense-in-depth so a `"read-only"` or `"annotate"` user's STS
 * session itself denies writes to the connection data plane, not just the UI.
 * Overwrite is `PutObject` (full-file write) — no `DeleteObject`.
 */
function getPutObjectStatement(bucketArn: string, prefix: string) {
  const objectArn = [bucketArn, prefix, "*"].filter(Boolean).join("/");

  return {
    Sid: "PutObjectScopedToPrefix",
    Effect: "Allow",
    Action: "s3:PutObject",
    Resource: objectArn,
  };
}

/**
 * `kms:Decrypt` allowing the role's per-key grants to flow through the STS
 * intersection so `GetObject` against SSE-KMS-encrypted objects succeeds. STS
 * applies the inline policy as a filter, so omitting `kms:Decrypt` would deny
 * it for the session even when the role's attached policy permits it. The
 * `kms:ViaService` condition confines the credential to the S3 data path
 * (it cannot call KMS directly); the role's attached policy + KMS key policy
 * remain the authority on which keys — `Resource: "*"` widens nothing.
 */
function getKmsDecryptStatement(region: string) {
  const viaServiceRegion = region || DEFAULT_REGION;
  if (/[*?]/.test(viaServiceRegion)) {
    throw new Error("Region may not contain IAM wildcard characters (`*`, `?`).");
  }

  return {
    Sid: "KmsDecryptViaS3",
    Effect: "Allow",
    Action: "kms:Decrypt",
    Resource: "*",
    Condition: {
      StringEquals: {
        "kms:ViaService": `s3.${viaServiceRegion}.amazonaws.com`,
      },
    },
  };
}

/** Whether the access level permits writes to the connection data plane. */
const permitsPrefixWrite = (accessLevel: AccessLevel): boolean =>
  accessLevel === "read-write" || accessLevel === "admin";

/** Whether the access level permits writing annotation sidecars. */
const permitsAnnotationWrite = (accessLevel: AccessLevel): boolean => accessLevel !== "read-only";

/** Build an inline IAM session policy for `AssumeRoleWithWebIdentityCommand`. */
export const buildSessionPolicy = ({
  bucketName,
  prefix: prefixRaw,
  subject,
  region,
  accessLevel,
}: SessionPolicyArgs): string => {
  // The subject is interpolated into the PutObject Resource ARN; an empty or
  // wildcard sub would widen the write scope to other users' sidecars.
  if (!subject) {
    throw new Error("Subject is required to build a session policy");
  }
  if (/[*?]/.test(subject)) {
    throw new Error("Subject may not contain IAM wildcard characters (`*`, `?`)");
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
    getListStatement(bucketArn, prefix),
    getObjectStatement(bucketArn, prefix),
    getKmsDecryptStatement(region),
  ];

  // The prefix grant (read-write/admin) subsumes the sidecar scope, so emit the
  // narrower sidecar statement only when the session cannot write the prefix.
  if (permitsAnnotationWrite(accessLevel) && !permitsPrefixWrite(accessLevel)) {
    statements.push(getPutOwnSidecarStatement(bucketArn, prefix, subject));
  }

  if (permitsPrefixWrite(accessLevel)) {
    statements.push(getPutObjectStatement(bucketArn, prefix));
  }

  const policy = {
    Version: "2012-10-17",
    Statement: statements,
  };

  // Compact JSON (no insignificant whitespace) — AWS counts the bytes actually
  // sent, so the size check must reflect the serialized form.
  const serialized = JSON.stringify(policy);

  if (serialized.length > POLICY_SIZE_CEILING) {
    throw new InlinePolicySizeError(serialized.length, POLICY_SIZE_CEILING);
  }

  return serialized;
};

/**
 * Arguments for {@link buildBrokerSessionPolicy} — the broker variant of
 * the inline session policy. Unlike the browser-path {@link SessionPolicyArgs},
 * the broker does not scope `PutObject` to the caller's annotation sidecars;
 * it scopes `PutObject` to the analysis's output prefix (SRS-CY-416103).
 */
export interface BrokerSessionPolicyArgs {
  bucketName: string;
  /** Key prefix within the bucket to scope list/get/put. Stripped of slashes. */
  prefix: string | null | undefined;
  /** AWS region of the connection's S3 endpoint — scopes `kms:ViaService`. */
  region: string;
}

/**
 * `kms:GenerateDataKey` allowing the role's per-key grants to flow through
 * the STS intersection so `PutObject` against an SSE-KMS-encrypted output
 * bucket succeeds (SRS-CY-416103). Same scoping as `kms:Decrypt`: the
 * `kms:ViaService` condition confines the credential to the S3 data path;
 * the role's attached policy + KMS key policy remain the authority on which
 * keys — `Resource: "*"` widens nothing.
 */
function getKmsGenerateDataKeyStatement(region: string) {
  const viaServiceRegion = region || DEFAULT_REGION;
  if (/[*?]/.test(viaServiceRegion)) {
    throw new Error("Region may not contain IAM wildcard characters (`*`, `?`).");
  }

  return {
    Sid: "KmsGenerateDataKeyViaS3",
    Effect: "Allow",
    Action: "kms:GenerateDataKey",
    Resource: "*",
    Condition: {
      StringEquals: {
        "kms:ViaService": `s3.${viaServiceRegion}.amazonaws.com`,
      },
    },
  };
}

/**
 * Build an inline IAM session policy for the broker's
 * `AssumeRoleWithWebIdentityCommand` (SRS-CY-416103). Reuses the list/get/kms
 * statements and the prefix-scoped `PutObject` from the browser path
 * (C-311's `getPutObjectStatement`); adds `kms:GenerateDataKey` so writes
 * to an SSE-KMS-encrypted output bucket succeed.
 */
export const buildBrokerSessionPolicy = ({
  bucketName,
  prefix: prefixRaw,
  region,
}: BrokerSessionPolicyArgs): string => {
  const prefix = stripSlashes(prefixRaw ?? "");

  if (/[*?]/.test(prefix)) {
    throw new Error("Prefix may not contain IAM wildcard characters (`*`, `?`)");
  }

  const bucketArn = `arn:aws:s3:::${bucketName}`;

  const policy = {
    Version: "2012-10-17",
    Statement: [
      getListStatement(bucketArn, prefix),
      getObjectStatement(bucketArn, prefix),
      getKmsDecryptStatement(region),
      getPutObjectStatement(bucketArn, prefix),
      getKmsGenerateDataKeyStatement(region),
    ],
  };

  const serialized = JSON.stringify(policy);

  if (serialized.length > POLICY_SIZE_CEILING) {
    throw new InlinePolicySizeError(serialized.length, POLICY_SIZE_CEILING);
  }

  return serialized;
};
