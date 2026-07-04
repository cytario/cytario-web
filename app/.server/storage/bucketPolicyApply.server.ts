import { GetBucketPolicyCommand, PutBucketPolicyCommand, S3Client } from "@aws-sdk/client-s3";
import { AssumeRoleWithWebIdentityCommand, STSClient } from "@aws-sdk/client-sts";

import { type BucketPolicyGrant, buildMergedPolicy, parseBucketPolicy } from "./bucketPolicy";
import { withBucketPolicyLock } from "./bucketPolicyLock";
import { buildWriteSessionPolicy } from "./writeSessionPolicy";
import { sanitizeRoleSessionName } from "~/.server/auth/getSessionCredentials";
import { createLabel } from "~/.server/logging";
import { getS3ProviderConfig } from "~/utils/s3Provider";

const label = createLabel("bucketpolicy-apply", "magenta");

/**
 * Everything the apply needs about the target, resolved from the connection's
 * provider connection + provider role — never stored on the connection row
 * itself. `roleArn` is the acting user's connection provider role; the write
 * session is minted against it.
 */
export interface ApplyTarget {
  organization: string;
  bucketName: string;
  region: string;
  endpoint: string | null;
  /** The acting user's connection provider role — the write session is minted against it. */
  roleArn: string;
  /** ARN of the bucket's SSE-KMS CMK, when SSE-KMS is in use. */
  kmsKeyArn?: string | null;
}

/**
 * Outcome of an apply. Deliberately carries NO credentials — the write-capable
 * STS session is server-only and this shape is what a server action returns
 * toward the browser.
 */
export interface ApplyResult {
  status: "applied" | "warning";
  /** Present when `status === "warning"`: why the grant could not be enforced. */
  warning?: string;
}

/** Extract the 12-digit AWS account id from an IAM role ARN for the lock key. */
export const accountIdFromRoleArn = (roleArn: string): string => {
  const match = /^arn:aws:iam::(\d{12}):role\//.exec(roleArn);
  if (!match) {
    throw new Error(`Cannot derive AWS account id from role ARN '${roleArn}' (fail closed).`);
  }
  return match[1];
};

/**
 * Detect an AWS AccessDenied on either the STS mint or the S3 write. The write
 * session's `s3:PutBucketPolicy` may be denied by the role's attached policy even
 * when `allowsSharing` was advisory-true — we WARN, never claim enforced.
 */
const isAccessDenied = (error: unknown): boolean => {
  if (!error || typeof error !== "object") return false;
  const name = String((error as { name?: string }).name ?? "");
  return name === "AccessDenied" || name === "AccessDeniedException";
};

/**
 * Mint the DISTINCT, write-capable STS session for the acting user against their
 * connection provider role, scoped by the inline write-session policy. These
 * credentials are server-only and never leave this module — they are handed
 * straight to a short-lived `S3Client` and discarded.
 */
const mintWriteSession = async (
  target: ApplyTarget,
  idToken: string,
  roleSessionName: string,
): Promise<S3Client> => {
  const { region, endpoint, roleArn, organization, bucketName, kmsKeyArn } = target;
  const providerConfig = getS3ProviderConfig(endpoint, region);

  const stsClient = new STSClient({ endpoint: providerConfig.stsEndpoint, region });
  const Policy = buildWriteSessionPolicy({ organization, bucketName, kmsKeyArn });

  const { Credentials } = await stsClient.send(
    new AssumeRoleWithWebIdentityCommand({
      RoleArn: roleArn,
      RoleSessionName: roleSessionName,
      WebIdentityToken: idToken,
      DurationSeconds: 60 * 15,
      Policy,
    }),
  );

  if (!Credentials?.AccessKeyId || !Credentials.SecretAccessKey || !Credentials.SessionToken) {
    throw new Error("No credentials returned from STS for the bucket-policy write session.");
  }

  return new S3Client({
    endpoint: providerConfig.s3Endpoint,
    region,
    forcePathStyle: providerConfig.usePathStyle,
    credentials: {
      accessKeyId: Credentials.AccessKeyId,
      secretAccessKey: Credentials.SecretAccessKey,
      sessionToken: Credentials.SessionToken,
    },
  });
};

/** Read the current bucket policy, tolerating the no-policy case. */
const getLivePolicy = async (client: S3Client, bucketName: string): Promise<string | null> => {
  try {
    const { Policy } = await client.send(new GetBucketPolicyCommand({ Bucket: bucketName }));
    return Policy ?? null;
  } catch (error) {
    // A bucket with no policy answers NoSuchBucketPolicy — treat as empty.
    const name = String((error as { name?: string })?.name ?? "");
    if (name === "NoSuchBucketPolicy") return null;
    throw error;
  }
};

/**
 * Apply the desired grant set to a bucket's policy. `grants` is the FULL managed
 * grant set the bucket should carry — every live share/connection on that bucket
 * the caller authorizes — so the operation is idempotent and naturally handles
 * un-share (a removed share is simply absent from `grants`). All-or-nothing: any
 * generation or size fault fails closed before the `PutBucketPolicy`.
 *
 * The write is serialized under the pinned per-(account, bucket) lock. On an AWS
 * AccessDenied (the write session lacks `s3:PutBucketPolicy`) it returns a
 * `warning` result — it never claims the grant was enforced.
 *
 * Server-only: the write-capable STS credentials never appear in the returned
 * `ApplyResult`.
 */
export const applyBucketPolicy = async (
  target: ApplyTarget,
  grants: BucketPolicyGrant[],
  idToken: string,
  actingUserName: string,
): Promise<ApplyResult> => {
  // Generate first (outside the lock) so a generation/size fault fails closed
  // before we mint a write session or touch the live policy. The merged document
  // is regenerated inside the lock against the freshly-read live policy; this
  // pre-check just short-circuits obvious faults.
  buildMergedPolicy(parseBucketPolicy(null), grants);

  const accountId = accountIdFromRoleArn(target.roleArn);
  const roleSessionName = sanitizeRoleSessionName(actingUserName);

  try {
    return await withBucketPolicyLock(accountId, target.bucketName, async () => {
      const client = await mintWriteSession(target, idToken, roleSessionName);

      const liveRaw = await getLivePolicy(client, target.bucketName);
      const live = parseBucketPolicy(liveRaw);

      const merged = buildMergedPolicy(live, grants);

      await client.send(
        new PutBucketPolicyCommand({ Bucket: target.bucketName, Policy: merged.serialized }),
      );

      return { status: "applied" as const } satisfies ApplyResult;
    });
  } catch (error) {
    if (isAccessDenied(error)) {
      console.warn(
        `${label} PutBucketPolicy denied for bucket ${target.bucketName}; access remains governed by the existing policy.`,
      );
      return {
        status: "warning",
        warning:
          "Your role could not apply the bucket policy (s3:PutBucketPolicy was denied). Access remains governed solely by the bucket policy that already exists, which may be broader than the chosen access.",
      };
    }
    throw error;
  }
};
