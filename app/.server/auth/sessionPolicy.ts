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
function getListStatement(Resource: string, prefix: string, StringEquals: Record<string, string>) {
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
          StringEquals,
        },
      }
    : {
        Sid: "ListBucketWholeBucket",
        Effect: "Allow",
        Action: "s3:ListBucket",
        Resource,
        Condition: {
          StringEquals,
        },
      };
}

/**
 * `GetObject` scoped to the connection prefix via the Resource ARN —
 * `bucket/<prefix>/*`, or the whole bucket when no prefix is set. The ORG tag
 * keeps reads tenant-scoped.
 */
function getObjectStatement(
  bucketArn: string,
  prefix: string,
  orgTagCondition: Record<string, string>,
) {
  const objectArn = [bucketArn, prefix, "*"].filter(Boolean).join("/");

  return {
    Sid: "GetObjectScopedToPrefix",
    Effect: "Allow",
    Action: "s3:GetObject",
    Resource: objectArn,
    Condition: {
      StringEquals: orgTagCondition,
    },
  };
}

/**
 * `PutObject` limited to the caller's OWN annotation sidecars
 * (`*.annotations.<sub>.json`) under the connection prefix — the trailing
 * `<sub>` segment stops a tampered client from writing another user's file
 * (which the cross-user read union would then surface as forged authorship).
 * Image data (`.ome.tif`/`.zarr`), `offsets.json`, and parquet stay read-only;
 * the ORG tag keeps writes tenant-scoped. Overwrite is `PutObject` (full-file
 * write of the user's own file) — no `DeleteObject`.
 */
function getPutStatement(
  bucketArn: string,
  prefix: string,
  subject: string,
  orgTagCondition: Record<string, string>,
) {
  const sidecarArn = [bucketArn, prefix, `*.annotations.${subject}.json`].filter(Boolean).join("/");

  return {
    Sid: "PutOwnAnnotationSidecars",
    Effect: "Allow",
    Action: "s3:PutObject",
    Resource: sidecarArn,
    Condition: {
      StringEquals: orgTagCondition,
    },
  };
}

/**
 * `kms:Decrypt` for SSE-KMS buckets. STS intersects this policy with the role's
 * attached policy; without an explicit `kms:Decrypt` here the role's KMS grant
 * is stripped and `GetObject` against SSE-KMS-encrypted buckets fails.
 * `kms:ViaService` restricts use of the minted credential to the S3 data path;
 * the role's attached policy remains the authoritative key allowlist.
 */
function getDecryptStatement(region: string, orgTagCondition: Record<string, string>) {
  return {
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
}

/** Build an inline IAM session policy for `AssumeRoleWithWebIdentityCommand`. */
export const buildSessionPolicy = ({
  organization,
  bucketName,
  prefix: prefixRaw,
  region,
  subject,
}: SessionPolicyArgs): string => {
  if (!organization) {
    throw new Error("Organization is required to build a session policy");
  }

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

  // Pinned to the Keycloak org alias emitted as the `ORG` AWS session tag by
  // cytario-keycloak's aws-principal-tag-mapper. AWS attaches it at
  // `AssumeRoleWithWebIdentity` time; this condition is the in-cytario half
  // of the defence-in-depth (role trust policy and bucket policy carry the
  // same condition).
  const orgTagCondition = { "aws:PrincipalTag/ORG": organization };

  const policy = {
    Version: "2012-10-17",
    Statement: [
      getListStatement(bucketArn, prefix, orgTagCondition),
      getObjectStatement(bucketArn, prefix, orgTagCondition),
      getPutStatement(bucketArn, prefix, subject, orgTagCondition),
      getDecryptStatement(region, orgTagCondition),
    ],
  };

  return JSON.stringify(policy);
};
