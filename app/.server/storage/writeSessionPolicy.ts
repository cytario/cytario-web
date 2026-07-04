/**
 * Inline session policy for the write-capable bucket-policy apply STS session.
 *
 * This is the STS `Policy` parameter scoping the DISTINCT write session minted for
 * the Share apply — NOT the S3 bucket policy itself (that is `bucketPolicy.ts`) and
 * NOT the read-only data-plane session policy (that is
 * `app/.server/auth/sessionPolicy.ts`). It grants exactly `s3:GetBucketPolicy` /
 * `s3:PutBucketPolicy` on the one bucket ARN and, for an SSE-KMS bucket, the KMS
 * key-policy read/write on the one CMK ARN, every statement conditioned on
 * `aws:PrincipalTag/ORG` so a leaked write session cannot touch another bucket or
 * another tenant's resources.
 *
 * It intentionally shares no construction code with the other two policy
 * generators; each independently carries the ORG condition.
 */

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
