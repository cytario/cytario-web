/**
 * Inline session policy for the write-capable bucket-policy apply STS session
 * on a RustFS-backed bucket — the counterpart of `writeSessionPolicy.ts`
 * (the AWS variant).
 *
 * RustFS applies the `Policy` parameter of AssumeRoleWithWebIdentity as a
 * filter over the mapped per-org policy set, exactly as AWS applies it over
 * the role's attached policy. The org binding here is the
 * `cytario-org-<alias>-admins` marker group the operator attaches the
 * org's management policy to — the mint itself fails when the caller's token
 * carries no management entitlement, so unlike the AWS variant there is no
 * `aws:PrincipalTag/ORG` condition to repeat inside the policy.
 *
 * Shares no construction code with the other policy generators (independence
 * rule).
 */

export interface RustfsWriteSessionPolicyArgs {
  organization: string;
  bucketName: string;
}

export const buildRustfsWriteSessionPolicy = ({
  organization,
  bucketName,
}: RustfsWriteSessionPolicyArgs): string => {
  if (!organization) {
    throw new Error("Organization is required to build a write-session policy (fail closed).");
  }
  if (!bucketName) {
    throw new Error("Bucket name is required to build a write-session policy (fail closed).");
  }
  if (/[*?]/.test(bucketName)) {
    throw new Error("Bucket name may not contain wildcard characters (`*`, `?`).");
  }

  const statements: Record<string, unknown>[] = [
    {
      Sid: "BucketPolicyReadWrite",
      Effect: "Allow",
      Action: ["s3:GetBucketPolicy", "s3:PutBucketPolicy"],
      Resource: `arn:aws:s3:::${bucketName}`,
    },
  ];

  return JSON.stringify({ Version: "2012-10-17", Statement: statements });
};
