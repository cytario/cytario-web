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
 * Image data (`.ome.tif`/`.zarr`), `offsets.json`, and parquet stay read-only.
 * Overwrite is `PutObject` (full-file write of the user's own file) — no
 * `DeleteObject`.
 */
function getPutStatement(bucketArn: string, prefix: string, subject: string) {
  const sidecarArn = [bucketArn, prefix, `*.annotations.${subject}.json`].filter(Boolean).join("/");

  return {
    Sid: "PutOwnAnnotationSidecars",
    Effect: "Allow",
    Action: "s3:PutObject",
    Resource: sidecarArn,
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

/** Build an inline IAM session policy for `AssumeRoleWithWebIdentityCommand`. */
export const buildSessionPolicy = ({
  bucketName,
  prefix: prefixRaw,
  subject,
  region,
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

  const policy = {
    Version: "2012-10-17",
    Statement: [
      getListStatement(bucketArn, prefix),
      getObjectStatement(bucketArn, prefix),
      getKmsDecryptStatement(region),
      getPutStatement(bucketArn, prefix, subject),
    ],
  };

  // Compact JSON (no insignificant whitespace) — AWS counts the bytes actually
  // sent, so the size check must reflect the serialized form.
  const serialized = JSON.stringify(policy);

  if (serialized.length > POLICY_SIZE_CEILING) {
    throw new InlinePolicySizeError(serialized.length, POLICY_SIZE_CEILING);
  }

  return serialized;
};
