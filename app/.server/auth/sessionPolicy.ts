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
  organization: string;
  bucketName: string;
  prefix: string | null | undefined;
  region: string;
}

const stripSlashes = (prefix: string): string => prefix.replace(/^\/+|\/+$/g, "");

/** Build an inline IAM session policy for `AssumeRoleWithWebIdentityCommand`. */
export const buildSessionPolicy = ({
  organization,
  bucketName,
  prefix,
  region,
}: SessionPolicyArgs): string => {
  if (!organization) {
    throw new Error("Organization is required to build a session policy");
  }
  const normalised = typeof prefix === "string" ? stripSlashes(prefix) : "";
  // Defense-in-depth: refuse wildcards here so the schema is not the only gate
  // protecting cross-tenant `StringLike` conditions.
  if (/[*?]/.test(normalised)) {
    throw new Error("Prefix may not contain IAM wildcard characters (`*`, `?`)");
  }
  const hasPrefix = normalised.length > 0;

  const bucketArn = `arn:aws:s3:::${bucketName}`;
  const objectArn = hasPrefix ? `${bucketArn}/${normalised}/*` : `${bucketArn}/*`;

  // Pinned to the Keycloak org alias emitted as the `ORG` AWS session tag by
  // cytario-keycloak's aws-principal-tag-mapper. AWS attaches it at
  // `AssumeRoleWithWebIdentity` time; this condition is the in-cytario half
  // of the defence-in-depth (role trust policy and bucket policy carry the
  // same condition).
  const orgTagCondition = { "aws:PrincipalTag/ORG": organization };

  // Empty-prefix listing must omit the `s3:prefix` condition: AWS evaluates an
  // absent `prefix` query parameter as `""`, and `StringLike "*"` does not
  // match it. Allowed values must anchor on `/`, otherwise IAM allows
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
          StringEquals: orgTagCondition,
        },
      }
    : {
        Sid: "ListBucketWholeBucket",
        Effect: "Allow",
        Action: "s3:ListBucket",
        Resource: bucketArn,
        Condition: {
          StringEquals: orgTagCondition,
        },
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
        ...orgTagCondition,
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
        Condition: {
          StringEquals: orgTagCondition,
        },
      },
      decryptStatement,
    ],
  };

  return JSON.stringify(policy);
};
