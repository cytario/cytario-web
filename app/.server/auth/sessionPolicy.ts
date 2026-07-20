/**
 * Builds an inline IAM session policy for `AssumeRoleWithWebIdentityCommand`.
 *
 * STS intersects this policy with the role's attached policy, so even if the
 * underlying role permits more, the minted credential cannot escape the
 * configured connection prefix.
 *
 * The ORG tenant binding is enforced by the role's trust policy (and the
 * bucket policy) — it is not repeated here. Keeping the inline policy lean
 * avoids hitting the 2048-character `Policy` limit early.
 *
 * AWS-specific: non-AWS providers (MinIO) may ignore or reject `Policy`;
 * guard the attachment behind `provider === "aws"`.
 */

export interface SessionPolicyArgs {
  bucketName: string;
  prefix: string | null | undefined;
  /** Keycloak `sub` of the caller — pins their writable sidecar to their own file. */
  subject: string;
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

/** Build an inline IAM session policy for `AssumeRoleWithWebIdentityCommand`. */
export const buildSessionPolicy = ({
  bucketName,
  prefix: prefixRaw,
  subject,
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
      getPutStatement(bucketArn, prefix, subject),
    ],
  };

  return JSON.stringify(policy);
};
