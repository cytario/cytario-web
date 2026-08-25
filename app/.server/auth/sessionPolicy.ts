/**
 * Builds an inline IAM session policy for `AssumeRoleWithWebIdentityCommand`.
 *
 * STS applies this policy as a **filter**: the effective session permissions are
 * the intersection of the role's attached policy and this inline policy, and an
 * action the inline policy does **not** allow is denied for the session
 * regardless of the role's attached policy. The inline policy must therefore
 * enumerate every action the browser data plane needs — including `kms:Decrypt`
 * for SSE-KMS-encrypted objects (omitting it silently strips the role's grant
 * and breaks `GetObject`). The role's attached policy (and the bucket's KMS key
 * policy) remain the authoritative allowlist of **which** KMS keys the credential
 * may decrypt; the inline `kms:Decrypt` `Resource: "*"` only lets the role's
 * per-key grants flow through the STS intersection — it widens nothing.
 *
 * The ORG tenant binding is enforced by the role's trust policy (and the
 * bucket policy) — it is not repeated here. Keeping the inline policy lean
 * avoids hitting the 2048-character `Policy` limit early.
 *
 * AWS-specific: non-AWS providers (MinIO) may ignore or reject `Policy`;
 * guard the attachment behind `provider === "aws"`.
 */

/** Mirrors `AccessLevel` from providerCatalog.schema — duplicated here to keep
 * the session-policy and bucket-policy generators import-disjoint (ARCH-1). */
type AccessLevel = "read-only" | "annotate" | "read-write" | "admin";

/** Fallback AWS region for the `kms:ViaService` condition when none is supplied. */
const DEFAULT_REGION = "eu-central-1";

/** AWS `AssumeRoleWithWebIdentity` `Policy` parameter ceiling (characters). */
export const POLICY_SIZE_CEILING = 2048;

/**
 * Thrown when the serialized inline session policy would exceed the AWS
 * `AssumeRoleWithWebIdentity` `Policy` parameter ceiling. `fetchTemporaryCredentials`
 * treats this as a connection-level failure — no STS call, no policy-less fallback.
 */
export class InlinePolicySizeError extends Error {
  readonly actualLength: number;
  readonly ceiling: number;

  constructor(actualLength: number, ceiling: number) {
    super(
      `Inline session policy size ceiling exceeded: serialized policy is ${actualLength} characters, ceiling is ${ceiling}.`,
    );
    this.name = "InlinePolicySizeError";
    this.actualLength = actualLength;
    this.ceiling = ceiling;
  }
}

export interface SessionPolicyArgs {
  bucketName: string;
  prefix: string | null | undefined;
  /** Keycloak `sub` of the caller — pins their writable sidecar to their own file. */
  subject: string;
  /** AWS region of the connection's S3 endpoint — scopes the `kms:ViaService` condition. */
  region: string;
  /**
   * Access level of the grant picked for the caller. `"read-write"` or `"admin"`
   * includes the prefix-wide `PutObject`; lower levels omit it so the STS
   * session itself denies writes to the connection data plane —
   * defense-in-depth, not just a UI gate.
   */
  accessLevel: AccessLevel;
}

const stripSlashes = (prefix: string): string => prefix.replace(/^\/+|\/+$/g, "");

/** Builds the object ARN `bucket/<prefix>/*` (or the whole bucket when no prefix). */
const objectArn = (bucketArn: string, prefix: string): string =>
  [bucketArn, prefix, "*"].filter(Boolean).join("/");

/**
 * `ListBucket` scoped to one or more prefixes via the `s3:prefix` condition
 * (a bucket-level action can't be scoped by Resource ARN). No-prefix listing
 * must omit the `s3:prefix` condition: AWS evaluates an absent `prefix` query
 * parameter as `""`, which `StringLike "*"` does not match. Allowed values
 * anchor on `/`, otherwise IAM allows `ListBucket prefix=foo` which S3 expands
 * to siblings like `foobar.txt`.
 */
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

/**
 * `GetObject` scoped to a prefix via the Resource ARN —
 * `bucket/<prefix>/*`, or the whole bucket when no prefix is set.
 */
function getObjectStatement(bucketArn: string, prefix: string) {
  return {
    Sid: "GetObjectScopedToPrefix",
    Effect: "Allow",
    Action: "s3:GetObject",
    Resource: objectArn(bucketArn, prefix),
  };
}

/**
 * `PutObject` limited to the caller's OWN sidecar files under the connection
 * prefix — the trailing `<sub>` segment stops a tampered client from writing
 * another user's file (which the cross-user read union would then surface as
 * forged authorship). Overwrite is `PutObject` (full-file write of the user's
 * own file) — no `DeleteObject`.
 *
 * Two sidecar kinds are covered:
 * - **Annotations** (`*.annotations.<sub>.json`) — per-image, the `*` matches
 *   the image base name (and any directory path, since IAM `*` matches `/`).
 * - **Settings** (`settings.<sub>.json` and `<dir>/settings.<sub>.json`) —
 *   directory-level, shared across sibling images in the same directory.
 *
 * Emitted only for the `annotate` level: `read-only` gets no write at all, and
 * `read-write`/`admin` get the broader prefix grant (see `getPutObjectStatement`)
 * which subsumes this scope — so image data, `offsets.json`, and parquet stay
 * read-only at the `annotate` level, and the inline policy stays lean.
 */
function getPutOwnSidecarStatement(bucketArn: string, prefix: string, subject: string) {
  const annotationArn = [bucketArn, prefix, `*.annotations.${subject}.json`]
    .filter(Boolean)
    .join("/");
  const settingsArnBase = [bucketArn, prefix, `settings.${subject}.json`].filter(Boolean).join("/");
  const settingsArnNested = [bucketArn, prefix, `*/settings.${subject}.json`]
    .filter(Boolean)
    .join("/");

  return {
    Sid: "PutOwnSidecars",
    Effect: "Allow",
    Action: "s3:PutObject",
    Resource: [annotationArn, settingsArnBase, settingsArnNested],
  };
}

/**
 * `PutObject` scoped to a prefix via the Resource ARN —
 * `bucket/<prefix>/*`, or the whole bucket when no prefix is set.
 *
 * Included only when the caller's grant `accessLevel` is `"read-write"` or
 * `"admin"` — defense-in-depth so a `"read-only"` or `"annotate"` user's STS
 * session itself denies writes to the connection data plane, not just the UI.
 * Overwrite is `PutObject` (full-file write) — no `DeleteObject`.
 */
function getPutObjectStatement(bucketArn: string, prefix: string) {
  return {
    Sid: "PutObjectScopedToPrefix",
    Effect: "Allow",
    Action: "s3:PutObject",
    Resource: objectArn(bucketArn, prefix),
  };
}

/**
 * A KMS data-plane statement scoped via `kms:ViaService` so the credential
 * can only reach KMS through the S3 data path (it cannot call KMS directly).
 * The role's attached policy + KMS key policy remain the authority on which
 * keys — `Resource: "*"` widens nothing. The inline policy is a filter, so
 * omitting these would deny them for the session regardless of the role.
 */
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

/** Whether the access level permits writing sidecar files (annotations + settings). */
const permitsSidecarWrite = (accessLevel: AccessLevel): boolean => accessLevel !== "read-only";

/** Build an inline IAM session policy for `AssumeRoleWithWebIdentityCommand`. */
export const buildSessionPolicy = ({
  bucketName,
  prefix: prefixRaw,
  subject,
  region,
  accessLevel,
}: SessionPolicyArgs): string => {
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
    statements.push(getPutOwnSidecarStatement(bucketArn, prefix, subject));
  }

  if (permitsPrefixWrite(accessLevel)) {
    statements.push(getPutObjectStatement(bucketArn, prefix));
    // Writing to an SSE-KMS-encrypted bucket requires kms:GenerateDataKey.
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
/**
 * A parsed `s3://bucket/prefix` URI — the shape the broker session-policy
 * builder works with after parsing the ledger-recorded targets.
 */
export interface S3Target {
  bucketName: string;
  prefix: string;
}

/**
 * Parse an `s3://bucket/prefix` URI into {@link S3Target}. Returns `null`
 * on an unparseable URI.
 *
 * The key is captured as the raw substring after `s3://<bucket>/` with no
 * encoding normalization: S3 keys may contain spaces and the characters
 * `?`, `#`, and `%` (all legal key bytes), and a generic URL parser would
 * percent-encode the space and silently truncate at `?`/`#`, corrupting
 * the session policy's `s3:prefix` StringLike patterns and Resource ARNs
 * against the actual keys.
 */
export function parseS3Uri(uri: string): S3Target | null {
  if (typeof uri !== "string" || !uri.startsWith("s3://")) return null;
  const rest = uri.slice("s3://".length);
  const slash = rest.indexOf("/");
  const bucketName = slash === -1 ? rest : rest.slice(0, slash);
  if (!bucketName) return null;
  const key = slash === -1 ? "" : rest.slice(slash + 1);
  return { bucketName, prefix: stripSlashes(key) };
}

/**
 * Arguments for {@link buildBrokerSessionPolicy} — scoped to the analysis's
 * validated input and output targets from the running-jobs ledger.
 */
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

/**
 * Build an inline IAM session policy for the broker's
 * `AssumeRoleWithWebIdentityCommand`. Scoped to the analysis's validated input
 * and output targets recorded in the ledger at submission — never from any
 * caller-supplied body field. Groups targets by bucket; `GetObject` covers
 * inputs + output; `PutObject` covers the output prefix only.
 */
export const buildBrokerSessionPolicy = ({
  inputs,
  output,
  region: _region,
}: BrokerSessionPolicyArgs): string => {
  void _region; // retained in the interface; unused since the ViaService
  // condition was removed (the role's policy constrains KMS).
  for (const target of inputs) validateS3Target(target);
  validateS3Target(output);

  const allTargets = [...inputs, output];

  const bucketPrefixes = new Map<string, Set<string>>();
  for (const target of allTargets) {
    const prefixes = bucketPrefixes.get(target.bucketName) ?? new Set<string>();
    if (target.prefix) prefixes.add(target.prefix);
    bucketPrefixes.set(target.bucketName, prefixes);
  }

  // Statements omit Sid fields (optional in IAM) and use compact prefix
  // patterns to minimize the serialized policy size. STS's
  // AssumeRoleWithWebIdentity limits the inline policy + the role's
  // attached managed policies to 2048 packed bytes; URL-encoding inflates
  // the JSON by ~38%, so every byte counts.
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
      // "prefix/" and "prefix/foo" — halves the prefix entries vs the
      // previous [prefix/, prefix/*] scheme.
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
  // objects under it (bucket/prefix/*). A single bucket/prefix/* ARN does not
  // match the bare key — HeadObject/GetObject on the file itself fails with
  // "no session policy allows the s3:GetObject action" (the intersection
  // rule means the inline policy must explicitly allow every ARN).
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

  // KMS actions without the ViaService condition — the role's attached
  // managed policy already constrains KMS to the S3 service, and the
  // session policy is an intersection (the more restrictive condition
  // from the role still applies). Omitting the condition here saves ~100
  // URL-encoded bytes while preserving the security boundary.
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
