import { z } from "zod";

import { ORG_ROOT_SCOPE } from "~/utils/authorization";

/**
 * A submitted owner scope: the org-root sentinel, a user sub, or a group path.
 * Constrained before it reaches `adminCovers` or a generated policy condition —
 * traversal-looking segments (`Lab/../x`) and IAM wildcard/variable characters
 * are rejected outright rather than relying on downstream predicates.
 */
export const scopeSchema = z
  .string()
  .min(1, "Scope is required")
  .max(255, "Scope must be at most 255 characters")
  .refine(
    (val) => val === ORG_ROOT_SCOPE || !/[*?\0\r\n]|\$\{/.test(val),
    "Scope contains invalid characters",
  )
  .refine(
    (val) => val === ORG_ROOT_SCOPE || !val.split("/").some((s) => s === "" || s === ".."),
    "Scope may not contain empty or traversal path segments",
  );

export const connectionNameSchema = z
  .string()
  .min(2, "Name must be at least 2 characters")
  .max(60, "Name must be at most 60 characters")
  .regex(
    /^[a-zA-Z0-9][a-zA-Z0-9 -]*[a-zA-Z0-9]$/,
    "Name must be alphanumeric with hyphens or spaces, no leading/trailing hyphens or spaces",
  )
  .refine((val) => !val.includes("--"), "Name must not contain consecutive hyphens")
  .refine((val) => !val.includes("  "), "Name must not contain consecutive spaces");

/** Maximum length of a connection / share prefix before generation. */
export const MAX_PREFIX_LENGTH = 1024;

/**
 * Validate a prefix before it enters any generated bucket policy:
 * reject IAM-wildcard characters (`*`, `?`), IAM policy-variable syntax (`${...}`),
 * the traversal segment `..`, the control characters NUL / CR / LF, and over-length
 * values, surfacing an explicit error and refusing to generate. Applied identically
 * to a connection prefix and to a shared folder prefix.
 */
export const prefixSchema = z
  .string()
  .max(MAX_PREFIX_LENGTH, `Prefix must be at most ${MAX_PREFIX_LENGTH} characters`)
  .refine((val) => !/[*?]/.test(val), "Prefix may not contain IAM wildcard characters (`*`, `?`)")
  .refine(
    (val) => !/\$\{/.test(val),
    "Prefix may not contain IAM policy-variable syntax (`${...}`)",
  )
  .refine(
    (val) => !val.split("/").some((segment) => segment === ".."),
    "Prefix may not contain the path-traversal segment `..`",
  )
  .refine(
    (val) => !/[\0\r\n]/.test(val),
    "Prefix may not contain NUL, carriage-return, or line-feed characters",
  );

/** S3 bucket-name syntax (3–63 chars, DNS-label style, no uppercase). */
export const bucketNameSchema = z
  .string()
  .min(3, "Bucket name must be at least 3 characters")
  .max(63, "Bucket name must be at most 63 characters")
  .regex(
    /^[a-z0-9][a-z0-9.-]*[a-z0-9]$/,
    "Bucket name must be lowercase alphanumeric with dots or hyphens, no leading/trailing separator",
  );

/**
 * A storage connection is composed by SELECTING a provider connection and a
 * provider role — never a free-text cloud role identifier or
 * endpoint. The concrete cloud role, endpoint, and region are carried by the
 * chosen provider connection + provider role (resolved server-side from the
 * catalog) and are never accepted from the form.
 */
export const connectionSchema = z.object({
  name: connectionNameSchema,
  scope: scopeSchema,
  providerConnectionId: z.string().min(1, "A provider connection is required"),
  providerRoleId: z.string().min(1, "A provider role is required"),
  bucketName: bucketNameSchema,
  prefix: prefixSchema.default(""),
});

export type ConnectBucketFormData = z.input<typeof connectionSchema>;
export type ConnectionFormValues = z.output<typeof connectionSchema>;

export const defaultFormValues: ConnectBucketFormData = {
  name: "",
  scope: "",
  providerConnectionId: "",
  providerRoleId: "",
  bucketName: "",
  prefix: "",
};

/** Auto-suggest a connection name from a bucket + optional prefix. */
export function suggestName(bucketName: string, prefix: string): string {
  const lastSegment = prefix.replace(/\/$/, "").split("/").filter(Boolean).pop();
  const base = lastSegment ? `${bucketName} ${lastSegment}` : bucketName;
  return base
    .replace(/[^a-zA-Z0-9 -]/g, " ")
    .replace(/ +/g, " ")
    .replace(/-+/g, "-")
    .replace(/^[- ]|[- ]$/g, "")
    .slice(0, 60);
}
