/**
 * Builds an inline IAM session policy for `AssumeRoleWithWebIdentityCommand`.
 *
 * STS intersects this policy with the role's attached policy, so even if the
 * underlying role permits more, the minted credential cannot escape the
 * configured connection prefix.
 *
 * AWS-specific: non-AWS providers (MinIO) may ignore or reject `Policy`;
 * guard the attachment behind `provider === "aws"`.
 */

export interface SessionPolicyArgs {
  bucketName: string;
  prefix: string | null | undefined;
  region: string;
}

const stripSlashes = (prefix: string): string => prefix.replace(/^\/+|\/+$/g, "");

/** Build an inline IAM session policy for `AssumeRoleWithWebIdentityCommand`. */
export const buildSessionPolicy = ({ bucketName, prefix, region }: SessionPolicyArgs): string => {
  const normalised = typeof prefix === "string" ? stripSlashes(prefix) : "";
  // Defense-in-depth: refuse wildcards here so the schema is not the only gate
  // protecting cross-tenant `StringLike` conditions.
  if (/[*?]/.test(normalised)) {
    throw new Error("Prefix may not contain IAM wildcard characters (`*`, `?`)");
  }
  const hasPrefix = normalised.length > 0;

  const bucketArn = `arn:aws:s3:::${bucketName}`;
  const objectArn = hasPrefix ? `${bucketArn}/${normalised}/*` : `${bucketArn}/*`;

  // Empty-prefix listing must omit `Condition`: AWS evaluates an absent
  // `prefix` query parameter as `""`, and `StringLike "*"` does not match it.
  // Allowed values must anchor on `/`, otherwise IAM allows
  // `ListBucket prefix=foo` which S3 expands to siblings like `foobar.txt`.
  const listStatement = hasPrefix
    ? {
        Sid: "ListBucketScopedToPrefix",
        Effect: "Allow",
        Action: "s3:ListBucket",
        Resource: bucketArn,
        Condition: {
          StringLike: {
            "s3:prefix": [`${normalised}/`, `${normalised}/*`],
          },
        },
      }
    : {
        Sid: "ListBucketWholeBucket",
        Effect: "Allow",
        Action: "s3:ListBucket",
        Resource: bucketArn,
      };

  // STS intersects this policy with the role's attached policy. Without an
  // explicit `kms:Decrypt` here, the role's KMS grant is stripped and
  // `GetObject` against SSE-KMS-encrypted buckets fails. `kms:ViaService`
  // restricts use of the minted credential to the S3 data path; the role's
  // attached policy remains the authoritative key allowlist.
  const decryptStatement = {
    Sid: "DecryptViaS3",
    Effect: "Allow",
    Action: "kms:Decrypt",
    Resource: "*",
    Condition: {
      StringEquals: {
        "kms:ViaService": `s3.${region}.amazonaws.com`,
      },
    },
  };

  const policy = {
    Version: "2012-10-17",
    Statement: [
      listStatement,
      {
        Sid: "GetObjectScopedToPrefix",
        Effect: "Allow",
        Action: "s3:GetObject",
        Resource: objectArn,
      },
      decryptStatement,
    ],
  };

  return JSON.stringify(policy);
};
