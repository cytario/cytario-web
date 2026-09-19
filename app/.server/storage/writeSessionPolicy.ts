// STS `Policy` for the DISTINCT write session of the Share apply — not the
// bucket policy itself (bucketPolicy.ts) and not the read-only data-plane
// session policy (auth/sessionPolicy.ts). Every statement is conditioned on
// `aws:PrincipalTag/ORG` so a leaked write session cannot touch another bucket
// or another tenant's resources; shares no construction code with the other
// two generators (each independently carries the ORG condition).

export interface WriteSessionPolicyArgs {
  organization: string;
  bucketName: string;
  /** ARN of the bucket's SSE-KMS CMK, when the bucket is SSE-KMS encrypted. */
  kmsKeyArn?: string | null;
}

export const buildWriteSessionPolicy = ({
  organization,
  bucketName,
  kmsKeyArn,
}: WriteSessionPolicyArgs): string => {
  if (!organization) {
    throw new Error("Organization is required to build a write-session policy (fail closed).");
  }
  if (!bucketName) {
    throw new Error("Bucket name is required to build a write-session policy (fail closed).");
  }
  if (/[*?]/.test(bucketName)) {
    throw new Error("Bucket name may not contain wildcard characters (`*`, `?`).");
  }

  const orgCondition = { StringEquals: { "aws:PrincipalTag/ORG": organization } };

  const statements: Record<string, unknown>[] = [
    {
      Sid: "BucketPolicyReadWrite",
      Effect: "Allow",
      Action: ["s3:GetBucketPolicy", "s3:PutBucketPolicy"],
      Resource: `arn:aws:s3:::${bucketName}`,
      Condition: orgCondition,
    },
  ];

  if (kmsKeyArn) {
    if (/[*?]/.test(kmsKeyArn)) {
      throw new Error("KMS key ARN may not contain wildcard characters (`*`, `?`).");
    }
    statements.push({
      Sid: "KmsKeyPolicyReadWrite",
      Effect: "Allow",
      Action: ["kms:GetKeyPolicy", "kms:PutKeyPolicy"],
      Resource: kmsKeyArn,
      Condition: orgCondition,
    });
  }

  return JSON.stringify({ Version: "2012-10-17", Statement: statements });
};
