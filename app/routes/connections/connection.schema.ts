import { z } from "zod";

import { isAllowedS3Host } from "~/utils/s3HostAllowlist";

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

const isDevelopment = process.env.NODE_ENV === "development";
const HTTP_ALLOWED_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

// `https://` endpoints must also pass the S3 allowlist; without that gate the
// server-side CORS probe could fetch IMDS / RFC1918 / loopback URLs.
const endpointUrlSchema = z
  .string()
  .url("Invalid endpoint URL")
  .refine(
    (val) => {
      let parsed: URL;
      try {
        parsed = new URL(val);
      } catch {
        return false;
      }
      if (parsed.protocol === "https:") return true;
      if (parsed.protocol !== "http:") return false;
      return isDevelopment || HTTP_ALLOWED_HOSTS.has(parsed.hostname);
    },
    {
      message: "Endpoint must use https:// (http:// only allowed for localhost, 127.0.0.1, or ::1)",
    },
  )
  .refine(
    (val) => {
      // Allowlist gate is https-only; the dev http carve-out above bypasses it
      // intentionally so local MinIO keeps working.
      let parsed: URL;
      try {
        parsed = new URL(val);
      } catch {
        return false;
      }
      if (parsed.protocol !== "https:") return true;
      return isAllowedS3Host(val);
    },
    {
      message:
        "Endpoint host is not in the cytario S3 allowlist. Ask the operator to add it to CYTARIO_ALLOWED_S3_HOSTS.",
    },
  );

const arnPattern = /^arn:aws:iam::\d{12}:role\/[\w+=,.@-]+$/;

const s3UriSchema = z
  .string()
  .min(1, "S3 URI is required")
  .refine(
    (val) => {
      const cleaned = val.replace(/^s3:\/\//, "");
      const bucketName = cleaned.split("/")[0];
      return bucketName.length >= 3 && bucketName.length <= 63;
    },
    { message: "Invalid S3 URI - bucket name must be 3-63 characters" },
  )
  .refine(
    (val) => {
      // Reject IAM wildcards — a prefix like `tenant-a*` would expand the
      // session policy's `StringLike` condition to neighbouring tenants.
      const cleaned = val.replace(/^s3:\/\//, "");
      const slashIdx = cleaned.indexOf("/");
      if (slashIdx === -1) return true;
      const prefix = cleaned.slice(slashIdx + 1);
      return !/[*?]/.test(prefix);
    },
    {
      message: "Prefix may not contain IAM wildcard characters (`*`, `?`)",
    },
  );

/** Auto-suggest a connection name from an S3 URI (e.g. "s3://my-bucket/path" → "my-bucket"). */
export function suggestName(s3Uri: string): string {
  const { bucketName, prefix } = parseS3Uri(s3Uri);
  const lastSegment = prefix.replace(/\/$/, "").split("/").filter(Boolean).pop();
  const base = lastSegment ? `${bucketName} ${lastSegment}` : bucketName;
  return base
    .replace(/[^a-zA-Z0-9 -]/g, " ")
    .replace(/ +/g, " ")
    .replace(/-+/g, "-")
    .replace(/^[- ]|[- ]$/g, "")
    .slice(0, 60);
}

export const parseS3Uri = (uri: string): { bucketName: string; prefix: string } => {
  const cleaned = uri.replace(/^s3:\/\//, "");
  const [bucketName, ...prefixParts] = cleaned.split("/");
  const prefix = prefixParts.join("/");
  return { bucketName, prefix };
};

const awsFormSchema = z.object({
  name: connectionNameSchema,
  ownerScope: z.string().min(1, "Scope is required"),
  providerType: z.literal("aws"),
  s3Uri: s3UriSchema,
  bucketRegion: z.string().min(1, "Region is required"),
  roleArn: z.string().regex(arnPattern, "Invalid AWS Role ARN format"),
  bucketEndpoint: z.string().default(""),
});

const minioFormSchema = z.object({
  name: connectionNameSchema,
  ownerScope: z.string().min(1, "Scope is required"),
  providerType: z.literal("minio"),
  s3Uri: s3UriSchema,
  bucketRegion: z.string().default(""),
  roleArn: z.string().default(""),
  bucketEndpoint: endpointUrlSchema,
});

export const connectionSchema = z.discriminatedUnion("providerType", [
  awsFormSchema,
  minioFormSchema,
]);

export type ConnectBucketFormData = z.input<typeof connectionSchema>;

export const defaultFormValues: ConnectBucketFormData = {
  name: "",
  ownerScope: "",
  providerType: "aws",
  s3Uri: "",
  bucketRegion: "eu-central-1",
  roleArn: "",
  bucketEndpoint: "",
};
