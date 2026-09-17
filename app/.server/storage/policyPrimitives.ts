/**
 * Protocol-level policy primitives shared by the AWS and RustFS bucket-policy
 * generators: S3 action sets, the policy-size ceiling, the managed-Sid prefix,
 * document types, and pure utilities. These are wire-protocol facts with no
 * security-bearing logic — the generators' binding vocabulary (principal-tag
 * conditions vs jwt:groups composites) stays deliberately separate, which the
 * architectural separation test asserts over the generator modules themselves.
 */

export type AccessLevel = "read-only" | "annotate" | "read-write" | "admin";

/** Hard S3-family limit on a bucket-policy document. Fail closed above it. */
export const BUCKET_POLICY_MAX_BYTES = 20480;

/** Every managed statement's `Sid` starts with this so foreign statements differ. */
export const MANAGED_SID_PREFIX = "Cytario";

/** Read actions granted at every access level. */
export const READ_ACTIONS = ["s3:GetObject"] as const;
/** Bucket-level list action (scoped by the `s3:prefix` Condition, not Resource ARN). */
export const LIST_ACTION = "s3:ListBucket";
/**
 * Bucket-level metadata reads every S3 client issues on connect (Cyberduck among
 * them) to resolve region, enumerate in-progress multipart uploads, and read
 * ownership controls.
 */
export const BUCKET_METADATA_ACTIONS = [
  "s3:GetBucketLocation",
  "s3:ListBucketMultipartUploads",
  "s3:GetBucketOwnershipControls",
] as const;
/**
 * Additional write + multipart actions granted for read-write / admin access.
 * Completing a multipart upload is authorized by `s3:PutObject` (already in the
 * list) — `s3:CompleteMultipartUpload` is an API operation, not an IAM action
 * key, and S3 rejects it in a policy with "Policy has invalid action".
 */
export const WRITE_ACTIONS = [
  "s3:PutObject",
  "s3:DeleteObject",
  "s3:AbortMultipartUpload",
  "s3:ListMultipartUploadParts",
] as const;

export interface PolicyCondition {
  StringEquals?: Record<string, string | string[]>;
  StringLike?: Record<string, string[]>;
  "ForAnyValue:StringEquals"?: Record<string, string | string[]>;
  [operator: string]: Record<string, string | string[]> | undefined;
}

export interface PolicyStatement {
  Sid?: string;
  Effect: "Allow" | "Deny";
  Principal?: unknown;
  Action: string | string[];
  Resource: string | string[];
  Condition?: PolicyCondition;
  [key: string]: unknown;
}

export interface BucketPolicyDocument {
  Version: string;
  Id?: string;
  Statement: PolicyStatement[];
}

export const stripSlashes = (value: string): string => value.replace(/^\/+|\/+$/g, "");

/**
 * Deterministic, collision-resistant suffix for a managed `Sid`. Derived from
 * the grant's stable identity so re-applying the same grant converges to the
 * same `Sid` — the property idempotency and revoke rely on. Uses a small
 * non-cryptographic hash (FNV-1a) rendered hex; a `Sid` must match
 * `[A-Za-z0-9]+`, so no separators.
 */
export const fnv1aHex = (input: string): string => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
};

export const EMPTY_POLICY: BucketPolicyDocument = { Version: "2012-10-17", Statement: [] };

/**
 * Parse a live bucket-policy document (the string `GetBucketPolicy` returns), or
 * the empty policy when the bucket has none. Throws on a malformed document so
 * the caller fails closed rather than clobbering an unparseable policy.
 */
export const parseBucketPolicy = (raw: string | null | undefined): BucketPolicyDocument => {
  if (!raw) return { ...EMPTY_POLICY, Statement: [] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Live bucket policy is not valid JSON; refusing to overwrite (fail closed).");
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    !Array.isArray((parsed as BucketPolicyDocument).Statement)
  ) {
    throw new Error(
      "Live bucket policy has no Statement array; refusing to overwrite (fail closed).",
    );
  }
  const doc = parsed as BucketPolicyDocument;
  return {
    Version: doc.Version || "2012-10-17",
    ...(doc.Id ? { Id: doc.Id } : {}),
    Statement: doc.Statement,
  };
};

/** True iff a statement is one the generators manage (identified by `Sid` prefix). */
export const isManagedStatement = (statement: PolicyStatement): boolean =>
  typeof statement.Sid === "string" && statement.Sid.startsWith(MANAGED_SID_PREFIX);
