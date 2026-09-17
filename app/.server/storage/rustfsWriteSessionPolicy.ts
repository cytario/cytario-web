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
 *
 * Asymmetry vs the AWS variant (`writeSessionPolicy.ts`), stated as an
 * invariant this module enforces at construction time: the RustFS write
 * session's allowed action set must be a SUBSET of the AWS variant's. AWS
 * conditions every statement on `aws:PrincipalTag/ORG`; RustFS has no session
 * tags, so the org binding there is the marker-group the operator attaches
 * the management policy to — the mint itself fails without it. What RustFS
 * must therefore never do is make up for the missing ORG condition by
 * widening the actions or resources: the RustFS policy grants at most the
 * AWS policy's bucket-policy read/write on the one bucket ARN, and nothing
 * else. The assert below fails closed (never returns a policy) if a future
 * edit violates that.
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

  // Construction-time invariant: this policy's effective authority is a
  // subset of the AWS variant's — exactly the bucket-policy read/write actions
  // on the one bucket ARN, one statement, no other actions or resources. The
  // missing `aws:PrincipalTag/ORG` condition is compensated ONLY by the mint
  // failing without the org's management marker group — never by granting
  // anything here that the AWS variant would not.
  const allowedActions = new Set(["s3:GetBucketPolicy", "s3:PutBucketPolicy"]);
  for (const statement of statements) {
    if (statement.Effect !== "Allow" || statement.Sid !== "BucketPolicyReadWrite") {
      throw new Error(
        "RustFS write-session policy shape drifted from the pinned subset invariant (fail closed).",
      );
    }
    const actions = Array.isArray(statement.Action) ? statement.Action : [statement.Action];
    if (
      actions.length !== allowedActions.size ||
      !actions.every((a) => allowedActions.has(a as string)) ||
      statement.Resource !== `arn:aws:s3:::${bucketName}`
    ) {
      throw new Error(
        "RustFS write-session policy exceeds the pinned subset invariant (fail closed).",
      );
    }
  }
  if (statements.length !== 1) {
    throw new Error(
      "RustFS write-session policy must contain exactly one statement (fail closed).",
    );
  }

  return JSON.stringify({ Version: "2012-10-17", Statement: statements });
};
