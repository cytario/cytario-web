import { GetBucketPolicyCommand, PutBucketPolicyCommand, S3Client } from "@aws-sdk/client-s3";
import { AssumeRoleWithWebIdentityCommand, STSClient } from "@aws-sdk/client-sts";

import { type BucketPolicyGrant, buildMergedPolicy, parseBucketPolicy } from "./bucketPolicy";
import { withBucketPolicyLock } from "./bucketPolicyLock";
import {
  type RustfsBucketPolicyGrant,
  buildMergedPolicy as buildRustfsMergedPolicy,
  parseBucketPolicy as parseRustfsBucketPolicy,
} from "./rustfsBucketPolicy";
import { buildRustfsWriteSessionPolicy } from "./rustfsWriteSessionPolicy";
import { buildWriteSessionPolicy } from "./writeSessionPolicy";
import { sanitizeRoleSessionName } from "~/.server/auth/getSessionCredentials";
import { createLabel } from "~/.server/logging";
import { getS3ProviderConfig } from "~/utils/s3Provider";

const label = createLabel("bucketpolicy-apply", "magenta");

/** The provider discriminator both grant shapes carry. */
export type GrantKind = BucketPolicyGrant["kind"] | RustfsBucketPolicyGrant["kind"];

/** A provider-tagged bucket-policy grant, either provider's shape. */
export type AnyBucketPolicyGrant = BucketPolicyGrant | RustfsBucketPolicyGrant;

/**
 * Everything the apply needs about the target, resolved from the connection's
 * provider connection + provider role — never stored on the connection row
 * itself. `roleArn` is the acting user's connection provider role; the write
 * session is minted against it.
 *
 * The AWS/RustFS split is expressed as a discriminated union on `providerType`
 * so each variant carries exactly the fields its engine uses: `kmsKeyArn`
 * exists only on the AWS target (a RustFS target carrying one is rejected
 * fail-closed — the RustFS write session has no KMS surface).
 */
export type ApplyTarget = AwsApplyTarget | RustfsApplyTarget;

export interface AwsApplyTarget {
  organization: string;
  bucketName: string;
  region: string;
  endpoint: string | null;
  /** The acting user's connection provider role — the write session is minted against it. */
  roleArn: string;
  /** ARN of the bucket's SSE-KMS CMK, when SSE-KMS is in use. */
  kmsKeyArn?: string | null;
  providerType: "aws";
}

export interface RustfsApplyTarget {
  organization: string;
  bucketName: string;
  region: string;
  endpoint: string;
  /** Opaque placeholder — the RustFS STS parses and ignores it. */
  roleArn: string;
  providerType: "rustfs";
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
 * The per-bucket lock-key namespace: the AWS account id on AWS targets, or the
 * endpoint host on a RustFS target (one deployment serves one account; the
 * host pins the instance).
 */
const lockNamespaceOf = (target: ApplyTarget): string => {
  if (target.providerType === "rustfs") {
    if (!target.endpoint) {
      throw new Error("A RustFS apply target requires an endpoint (fail closed).");
    }
    return new URL(target.endpoint).host;
  }
  return accountIdFromRoleArn(target.roleArn);
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
  const { region, endpoint, roleArn, organization, bucketName, providerType } = target;
  const providerConfig = getS3ProviderConfig(endpoint, region, providerType);

  const stsClient = new STSClient({ endpoint: providerConfig.stsEndpoint, region });
  const Policy =
    providerType === "rustfs"
      ? buildRustfsWriteSessionPolicy({ organization, bucketName })
      : buildWriteSessionPolicy({
          organization,
          bucketName,
          kmsKeyArn: target.providerType === "aws" ? target.kmsKeyArn : undefined,
        });

  const { Credentials } = await stsClient.send(
    new AssumeRoleWithWebIdentityCommand({
      RoleArn: roleArn,
      RoleSessionName: roleSessionName,
      WebIdentityToken: idToken,
      DurationSeconds: 60 * 15,
      ...(Policy ? { Policy } : {}),
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
    console.log(`${label} getLivePolicy error: ${error}`);
    // A bucket with no policy answers NoSuchBucketPolicy — treat as empty.
    const name = String((error as { name?: string })?.name ?? "");
    if (name === "NoSuchBucketPolicy") return null;
    throw error;
  }
};

/**
 * A bucket's grant set must be homogeneous with the target's provider: an AWS
 * grant carries `kind: "aws"` (role-ARN Principal), a RustFS grant `kind:
 * "rustfs"` (composite jwt:groups condition) — a mixed set can never compile
 * correctly through a single generator. The explicit `kind` discriminator makes
 * the check structural; catalog drift where a provider connection is missing
 * fails the homogeneity guard rather than silently compiling the wrong shape.
 */
const assertGrantSetHomogeneity = (target: ApplyTarget, grants: AnyBucketPolicyGrant[]): void => {
  const expected: GrantKind = target.providerType === "rustfs" ? "rustfs" : "aws";
  const stray = grants.find((grant) => grant.kind !== expected);
  if (stray) {
    throw new Error(
      `A ${target.providerType} bucket-policy apply received a ${stray.kind}-shaped grant (mixed providers on one bucket) — refusing, fail closed.`,
    );
  }
};

/**
 * Apply the desired grant set to a bucket's policy. `grants` is the FULL managed
 * grant set the bucket should carry — every live share/connection on that bucket
 * the caller authorizes — so the operation is idempotent and naturally handles
 * un-share (a removed share is simply absent from `grants`). All-or-nothing: any
 * generation or size fault fails closed before the `PutBucketPolicy`.
 *
 * A bucket is served by one provider connection, so the grant set must be
 * homogeneous: a mixed AWS/RustFS set would compile through one generator and
 * silently lose the other's binding vocabulary — rejected fail-closed here.
 *
 * On an AWS target the write is serialized under the per-(account, bucket) lock;
 * on a RustFS target under the per-(endpoint-host, bucket) lock — the same
 * mutual exclusion the AWS lock provides, keyed to the S3-compatible instance.
 * The admin portal's bootstrap write serializes on the same key: it must use the
 * endpoint host (not an AWS account id) for a RustFS bucket.
 *
 * On an AccessDenied (the write session lacks `s3:PutBucketPolicy`) it returns a
 * `warning` result — it never claims the grant was enforced.
 *
 * Server-only: the write-capable STS credentials never appear in the returned
 * `ApplyResult`.
 */
export const applyBucketPolicy = async (
  target: ApplyTarget,
  grants: AnyBucketPolicyGrant[],
  idToken: string,
  actingUserName: string,
): Promise<ApplyResult> => {
  // The write-session role (`target.roleArn`) signs the PutBucketPolicy; each
  // grant's own `roleArn` is the statement Principal on AWS. A grant without a
  // `roleArn` is rejected fail-closed by `compileGrantStatements`.
  assertGrantSetHomogeneity(target, grants);

  // Generate first (outside the lock) so a generation/size fault fails closed
  // before we mint a write session or touch the live policy. The merged document
  // is regenerated inside the lock against the freshly-read live policy; this
  // pre-check just short-circuits obvious faults.
  if (target.providerType === "rustfs") {
    buildRustfsMergedPolicy(parseRustfsBucketPolicy(null), grants as RustfsBucketPolicyGrant[]);
  } else {
    buildMergedPolicy(parseBucketPolicy(null), grants as BucketPolicyGrant[]);
  }

  const lockNamespace = lockNamespaceOf(target);
  const roleSessionName = sanitizeRoleSessionName(actingUserName);

  try {
    return await withBucketPolicyLock(lockNamespace, target.bucketName, async () => {
      const client = await mintWriteSession(target, idToken, roleSessionName);

      const liveRaw = await getLivePolicy(client, target.bucketName);

      const serialized =
        target.providerType === "rustfs"
          ? buildRustfsMergedPolicy(
              parseRustfsBucketPolicy(liveRaw),
              grants as RustfsBucketPolicyGrant[],
            ).serialized
          : buildMergedPolicy(parseBucketPolicy(liveRaw), grants as BucketPolicyGrant[]).serialized;

      await client.send(
        new PutBucketPolicyCommand({ Bucket: target.bucketName, Policy: serialized }),
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
