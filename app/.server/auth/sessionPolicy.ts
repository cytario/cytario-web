// STS applies the inline policy as a FILTER: effective session permissions are
// the intersection with the role's attached policy, so the inline policy must
// enumerate every action the data plane needs (omitting kms:Decrypt silently
// breaks GetObject on SSE-KMS objects; Resource:"*" widens nothing — the role
// and key policies stay the per-key authority). The ORG tenant binding is
// enforced by the role's trust policy, not repeated here — lean also keeps us
// under the 2048-character Policy limit.

import { InlinePolicySizeError, POLICY_SIZE_CEILING } from "./inlinePolicySize";

/** Duplicated to keep the session-policy and bucket-policy generators import-disjoint. */
type AccessLevel = "read-only" | "annotate" | "read-write" | "admin";

/** Fallback AWS region for the `kms:ViaService` condition when none is supplied. */
const DEFAULT_REGION = "eu-central-1";

export { InlinePolicySizeError, POLICY_SIZE_CEILING };

export interface SessionPolicyArgs {
  bucketName: string;
  prefix: string | null | undefined;
  /** AWS region of the connection's S3 endpoint — scopes the `kms:ViaService` condition. */
  region: string;
  // Lower levels omit prefix-wide PutObject so the STS session itself denies
  // writes — defense-in-depth, not just a UI gate.
  accessLevel: AccessLevel;
}

const stripSlashes = (prefix: string): string => prefix.replace(/^\/+|\/+$/g, "");

/** Builds the object ARN `bucket/<prefix>/*` (or the whole bucket when no prefix). */
const objectArn = (bucketArn: string, prefix: string): string =>
  [bucketArn, prefix, "*"].filter(Boolean).join("/");

// No-prefix listing must OMIT the `s3:prefix` condition: AWS evaluates an absent
// prefix parameter as "", which StringLike "*" does not match. Allowed values
// anchor on `/` or ListBucket prefix=foo would match siblings like foobar.txt.
function listBucketStatement(bucketArn: string, prefixes: string[], sid: string) {
  const hasPrefix = prefixes.length > 0;

  return hasPrefix
    ? {
        Sid: sid,
        Effect: "Allow",
        Action: "s3:ListBucket",
        Resource: bucketArn,
        Condition: {
          StringLike: {
            "s3:prefix": prefixes.flatMap((p) => [`${p}/`, `${p}/*`]),
          },
        },
      }
    : {
        Sid: sid,
        Effect: "Allow",
        Action: "s3:ListBucket",
        Resource: bucketArn,
      };
}

/** GetObject scoped to a prefix via the Resource ARN (or the whole bucket when no prefix). */
function getObjectStatement(bucketArn: string, prefix: string) {
  return {
    Sid: "GetObjectScopedToPrefix",
    Effect: "Allow",
    Action: "s3:GetObject",
    Resource: objectArn(bucketArn, prefix),
  };
}

// Sidecar PutObject for the annotate level only: the wildcard segment allows
// writing any annotation set — per-user scoping is by filename convention
// (the UUID in the key), not IAM enforcement. read-write/admin get the broader
// prefix grant instead.
function getPutOwnSidecarStatement(bucketArn: string, prefix: string) {
  const annotationArn = [bucketArn, prefix, `*.annotations.*.json`].filter(Boolean).join("/");
  const settingsArnBase = [bucketArn, prefix, `settings.*.json`].filter(Boolean).join("/");
  const settingsArnNested = [bucketArn, prefix, `*/settings.*.json`].filter(Boolean).join("/");

  return {
    Sid: "PutOwnSidecars",
    Effect: "Allow",
    Action: "s3:PutObject",
    Resource: [annotationArn, settingsArnBase, settingsArnNested],
  };
}

// Annotation-sidecar DeleteObject for every level that can write sidecars: the
// read-write/admin prefix grant carries PutObject only, so they need this too.
function getDeleteSidecarStatement(bucketArn: string, prefix: string) {
  const annotationArn = [bucketArn, prefix, `*.annotations.*.json`].filter(Boolean).join("/");

  return {
    Sid: "DeleteAnnotationSidecars",
    Effect: "Allow",
    Action: "s3:DeleteObject",
    Resource: annotationArn,
  };
}

/**
 * `PutObject` scoped to a prefix via the Resource ARN —
 * `bucket/<prefix>/*`, or the whole bucket when no prefix is set.
 *
 * Included only when the caller's grant `accessLevel` is `"read-write"` or
 * `"admin"` — defense-in-depth so a `"read-only"` or `"annotate"` user's STS
 * session itself denies writes to the connection data plane, not just the UI.
 * Overwrite is `PutObject` (full-file write); object deletion stays scoped to
 * annotation sidecars (see `getDeleteSidecarStatement`).
 */
function getPutObjectStatement(bucketArn: string, prefix: string) {
  return {
    Sid: "PutObjectScopedToPrefix",
    Effect: "Allow",
    Action: "s3:PutObject",
    Resource: objectArn(bucketArn, prefix),
  };
}

// KMS scoped via kms:ViaService so the credential can only reach KMS through
// the S3 data path; Resource:"*" widens nothing (role + key policies are the
// per-key authority).
function getKmsStatement(action: "kms:Decrypt" | "kms:GenerateDataKey", region: string) {
  const viaServiceRegion = region || DEFAULT_REGION;
  if (/[*?]/.test(viaServiceRegion)) {
    throw new Error("Region may not contain IAM wildcard characters (`*`, `?`).");
  }

  return {
    Sid: action === "kms:Decrypt" ? "KmsDecryptViaS3" : "KmsGenerateDataKeyViaS3",
    Effect: "Allow",
    Action: action,
    Resource: "*",
    Condition: {
      StringEquals: {
        "kms:ViaService": `s3.${viaServiceRegion}.amazonaws.com`,
      },
    },
  };
}

/** Whether the access level permits writes to the connection data plane. */
const permitsPrefixWrite = (accessLevel: AccessLevel): boolean =>
  accessLevel === "read-write" || accessLevel === "admin";

const permitsSidecarWrite = (accessLevel: AccessLevel): boolean => accessLevel !== "read-only";

/** Build an inline IAM session policy for `AssumeRoleWithWebIdentityCommand`. */
export const buildSessionPolicy = ({
  bucketName,
  prefix: prefixRaw,
  region,
  accessLevel,
}: SessionPolicyArgs): string => {
  const prefix = stripSlashes(prefixRaw ?? "");

  // Defense-in-depth: refuse wildcards here so the schema is not the only gate
  // protecting cross-tenant `StringLike` conditions.
  if (/[*?]/.test(prefix)) {
    throw new Error("Prefix may not contain IAM wildcard characters (`*`, `?`)");
  }

  const bucketArn = `arn:aws:s3:::${bucketName}`;

  const statements: Array<{
    Sid: string;
    Effect: string;
    Action: string;
    Resource: string | string[];
    Condition?: Record<string, Record<string, string | string[]>>;
  }> = [
    listBucketStatement(
      bucketArn,
      prefix ? [prefix] : [],
      prefix ? "ListBucketScopedToPrefix" : "ListBucketWholeBucket",
    ),
    getObjectStatement(bucketArn, prefix),
    getKmsStatement("kms:Decrypt", region),
  ];

  // The prefix grant (read-write/admin) subsumes the sidecar scope, so emit the
  // narrower sidecar statement only when the session cannot write the prefix.
  if (permitsSidecarWrite(accessLevel) && !permitsPrefixWrite(accessLevel)) {
    statements.push(getPutOwnSidecarStatement(bucketArn, prefix));
  }

  // Annotation-set deletion for every level that can write sidecars.
  if (permitsSidecarWrite(accessLevel)) {
    statements.push(getDeleteSidecarStatement(bucketArn, prefix));
  }

  if (permitsPrefixWrite(accessLevel)) {
    statements.push(getPutObjectStatement(bucketArn, prefix));
  }

  // Sidecar writes to an SSE-KMS-encrypted bucket require data-key generation.
  if (permitsSidecarWrite(accessLevel)) {
    statements.push(getKmsStatement("kms:GenerateDataKey", region));
  }

  const policy = {
    Version: "2012-10-17",
    Statement: statements,
  };

  // Compact JSON (no insignificant whitespace) — AWS counts the bytes actually
  // sent, so the size check must reflect the serialized form.
  const serialized = JSON.stringify(policy);

  if (serialized.length > POLICY_SIZE_CEILING) {
    throw new InlinePolicySizeError(serialized.length, POLICY_SIZE_CEILING);
  }

  return serialized;
};
// A parsed `s3://bucket/prefix` URI for the broker session-policy builder.
export interface S3Target {
  bucketName: string;
  prefix: string;
}

/** Parse an `s3://bucket/prefix` URI; `null` on an unparseable URI. */
export function parseS3Uri(uri: string): S3Target | null {
  // The key is captured as the raw substring with no encoding normalization:
  // S3 keys may contain spaces and `?`, `#`, `%`, and a generic URL parser
  // would percent-encode the space or truncate at `?`/`#`, corrupting the
  // session policy's patterns against the actual keys.
  if (typeof uri !== "string" || !uri.startsWith("s3://")) return null;
  const rest = uri.slice("s3://".length);
  const slash = rest.indexOf("/");
  const bucketName = slash === -1 ? rest : rest.slice(0, slash);
  if (!bucketName) return null;
  const key = slash === -1 ? "" : rest.slice(slash + 1);
  return { bucketName, prefix: stripSlashes(key) };
}

/** Scoped to the analysis's validated input and output targets from the running-jobs ledger. */
export interface BrokerSessionPolicyArgs {
  inputs: S3Target[];
  output: S3Target;
  region: string;
}

function validateS3Target(target: S3Target): void {
  if (/[*?]/.test(target.bucketName)) {
    throw new Error("Bucket name may not contain IAM wildcard characters (`*`, `?`)");
  }
  if (/[*?]/.test(target.prefix)) {
    throw new Error("Prefix may not contain IAM wildcard characters (`*`, `?`)");
  }
}

// Scoped to the analysis's validated ledger targets — never from any
// caller-supplied body field. GetObject covers inputs + output; PutObject the
// output prefix only.
export const buildBrokerSessionPolicy = ({
  inputs,
  output,
  region: _region,
}: BrokerSessionPolicyArgs): string => {
  void _region; // retained in the interface for callers; unused here
  for (const target of inputs) validateS3Target(target);
  validateS3Target(output);

  const allTargets = [...inputs, output];

  const bucketPrefixes = new Map<string, Set<string>>();
  for (const target of allTargets) {
    const prefixes = bucketPrefixes.get(target.bucketName) ?? new Set<string>();
    if (target.prefix) prefixes.add(target.prefix);
    bucketPrefixes.set(target.bucketName, prefixes);
  }

  // Sid fields omitted and prefix patterns kept compact: STS caps the inline
  // policy at 2048 packed bytes and URL-encoding inflates the JSON by ~38%.
  const statements: Array<{
    Effect: string;
    Action: string | string[];
    Resource: string | string[];
    Condition?: Record<string, Record<string, string | string[]>>;
  }> = [];

  for (const [bucketName, prefixes] of bucketPrefixes) {
    const bucketArn = `arn:aws:s3:::${bucketName}`;
    if (prefixes.size > 0) {
      // Single StringLike pattern per prefix: "prefix*" matches both
      // "prefix/" and "prefix/foo".
      statements.push({
        Effect: "Allow",
        Action: "s3:ListBucket",
        Resource: bucketArn,
        Condition: {
          StringLike: {
            "s3:prefix": [...prefixes].sort().map((p) => `${p}*`),
          },
        },
      });
    } else {
      statements.push({
        Effect: "Allow",
        Action: "s3:ListBucket",
        Resource: bucketArn,
      });
    }
  }

  // GetObject must cover both the target object itself (bucket/prefix) and
  // objects under it: a single bucket/prefix/* ARN does not match the bare
  // key, and the intersection rule requires the inline policy to explicitly
  // allow every ARN.
  const getObjectResources = allTargets.flatMap((target) => {
    const base = `arn:aws:s3:::${target.bucketName}`;
    return target.prefix
      ? [`${base}/${target.prefix}`, `${base}/${target.prefix}/*`]
      : [`${base}/*`];
  });
  statements.push({
    Effect: "Allow",
    Action: "s3:GetObject",
    Resource: [...new Set(getObjectResources)].sort(),
  });

  statements.push({
    Effect: "Allow",
    Action: "s3:PutObject",
    Resource: objectArn(`arn:aws:s3:::${output.bucketName}`, output.prefix),
  });

  // KMS actions without the ViaService condition: the role's attached policy
  // already constrains KMS to S3, and the session policy is an intersection;
  // omitting the condition saves ~100 URL-encoded bytes.
  statements.push({
    Effect: "Allow",
    Action: ["kms:Decrypt", "kms:GenerateDataKey"],
    Resource: "*",
  });

  const policy = { Version: "2012-10-17", Statement: statements };
  const serialized = JSON.stringify(policy);

  if (serialized.length > POLICY_SIZE_CEILING) {
    throw new InlinePolicySizeError(serialized.length, POLICY_SIZE_CEILING);
  }

  return serialized;
};
