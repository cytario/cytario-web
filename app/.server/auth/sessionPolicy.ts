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
   * includes the widened `PutObject` for editable text objects (C-311); lower
   * levels omit it so the STS session itself denies text-object writes —
   * defense-in-depth, not just a UI gate.
   */
  accessLevel: AccessLevel;
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
function getListStatement(Resource: string, prefix: string) {
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
        },
      }
    : {
        Sid: "ListBucketWholeBucket",
        Effect: "Allow",
        Action: "s3:ListBucket",
        Resource,
      };
}

/**
 * `GetObject` scoped to the connection prefix via the Resource ARN —
 * `bucket/<prefix>/*`, or the whole bucket when no prefix is set.
 */
function getObjectStatement(bucketArn: string, prefix: string) {
  const objectArn = [bucketArn, prefix, "*"].filter(Boolean).join("/");

  return {
    Sid: "GetObjectScopedToPrefix",
    Effect: "Allow",
    Action: "s3:GetObject",
    Resource: objectArn,
  };
}

/**
 * `PutObject` limited to the caller's OWN annotation sidecars
 * (`*.annotations.<sub>.json`) under the connection prefix — the trailing
 * `<sub>` segment stops a tampered client from writing another user's file
 * (which the cross-user read union would then surface as forged authorship).
 * Image data (`.ome.tif`/`.zarr`), `offsets.json`, and parquet stay read-only.
 * Overwrite is `PutObject` (full-file write of the user's own file) — no
 * `DeleteObject`.
 */
function getPutStatement(bucketArn: string, prefix: string, subject: string) {
  const sidecarArn = [bucketArn, prefix, `*.annotations.${subject}.json`].filter(Boolean).join("/");

  return {
    Sid: "PutOwnAnnotationSidecars",
    Effect: "Allow",
    Action: "s3:PutObject",
    Resource: sidecarArn,
  };
}

/**
 * `PutObject` on editable text objects (`.json`, `.yaml`, `.yml`, `.txt`)
 * under the connection prefix — enables the in-app text editor (C-311) to
 * save changes back to S3. Image data (`.ome.tif`/`.zarr`/`.tif`), parquet
 * (overlay results), and other binary formats stay read-only by omission —
 * no `PutObject` Allow matches their keys. Overwrite is `PutObject`
 * (full-file write) — no `DeleteObject`.
 *
 * Included only when the caller's grant `accessLevel` is `"read-write"` or
 * `"admin"` — defense-in-depth so a `"read-only"` or `"annotate"` user's STS
 * session itself denies text-object writes, not just the UI.
 *
 * NOTE (C-311): The broad `*.json` Allow supersedes the per-user sidecar
 * isolation from `getPutStatement` — any user with a read-write session can
 * overwrite any `.json` under the prefix, including another user's annotation
 * sidecar. IAM cannot distinguish annotation sidecars from regular `.json`
 * files by key pattern alone. The application-layer write path
 * (`SidecarRepository.write`) still only writes the caller's own sidecar,
 * so correct app behavior is preserved; the relaxation is at the IAM
 * perimeter only.
 */
function getEditTextPutStatement(bucketArn: string, prefix: string) {
  const editableExtensions = ["*.json", "*.yaml", "*.yml", "*.txt"];
  const resources = editableExtensions.map((ext) =>
    [bucketArn, prefix, ext].filter(Boolean).join("/"),
  );

  return {
    Sid: "PutEditableTextObjects",
    Effect: "Allow",
    Action: "s3:PutObject",
    Resource: resources,
  };
}

/**
 * `kms:Decrypt` allowing the role's per-key grants to flow through the STS
 * intersection so `GetObject` against SSE-KMS-encrypted objects succeeds. STS
 * applies the inline policy as a filter, so omitting `kms:Decrypt` would deny
 * it for the session even when the role's attached policy permits it. The
 * `kms:ViaService` condition confines the credential to the S3 data path
 * (it cannot call KMS directly); the role's attached policy + KMS key policy
 * remain the authority on which keys — `Resource: "*"` widens nothing.
 */
function getKmsDecryptStatement(region: string) {
  const viaServiceRegion = region || DEFAULT_REGION;
  if (/[*?]/.test(viaServiceRegion)) {
    throw new Error("Region may not contain IAM wildcard characters (`*`, `?`).");
  }

  return {
    Sid: "KmsDecryptViaS3",
    Effect: "Allow",
    Action: "kms:Decrypt",
    Resource: "*",
    Condition: {
      StringEquals: {
        "kms:ViaService": `s3.${viaServiceRegion}.amazonaws.com`,
      },
    },
  };
}

/** Whether the access level permits general (text-object) writes. */
const permitsTextObjectWrite = (accessLevel: AccessLevel): boolean =>
  accessLevel === "read-write" || accessLevel === "admin";

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
    getListStatement(bucketArn, prefix),
    getObjectStatement(bucketArn, prefix),
    getKmsDecryptStatement(region),
    getPutStatement(bucketArn, prefix, subject),
  ];

  if (permitsTextObjectWrite(accessLevel)) {
    statements.push(getEditTextPutStatement(bucketArn, prefix));
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
