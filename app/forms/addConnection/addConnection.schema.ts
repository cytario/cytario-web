import { z } from "zod";

// Connection alias: 2-60 chars, lowercase alphanumeric + hyphens, no leading/trailing hyphens
export const aliasSchema = z
  .string()
  .min(2, "Alias must be at least 2 characters")
  .max(60, "Alias must be at most 60 characters")
  .regex(
    /^[a-z0-9][a-z0-9-]*[a-z0-9]$/,
    "Alias must be lowercase alphanumeric with hyphens, no leading/trailing hyphens",
  )
  .refine(
    (val) => !val.includes("--"),
    "Alias must not contain consecutive hyphens",
  );

// AWS ARN pattern validation
const arnPattern = /^arn:aws:iam::\d{12}:role\/[\w+=,.@-]+$/;

// S3 URI validation - extracts bucket name and optional prefix
const s3UriSchema = z
  .string()
  .min(1, "S3 URI is required")
  .refine(
    (val) => {
      // Accept either "s3://bucket/path" or just "bucket/path" or "bucket"
      const cleaned = val.replace(/^s3:\/\//, "");
      const bucketName = cleaned.split("/")[0];
      return bucketName.length >= 3 && bucketName.length <= 63;
    },
    { message: "Invalid S3 URI - bucket name must be 3-63 characters" },
  );

/** Auto-suggest an alias from an S3 URI (e.g. "s3://my-bucket/path" → "my-bucket"). */
export function suggestAlias(s3Uri: string): string {
  const { bucketName, prefix } = parseS3Uri(s3Uri);
  const lastSegment = prefix
    .replace(/\/$/, "")
    .split("/")
    .filter(Boolean)
    .pop();
  const base = lastSegment ? `${bucketName}-${lastSegment}` : bucketName;
  return base
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

// Helper to parse S3 URI into bucket name and prefix
export const parseS3Uri = (
  uri: string,
): { bucketName: string; prefix: string } => {
  const cleaned = uri.replace(/^s3:\/\//, "");
  const [bucketName, ...prefixParts] = cleaned.split("/");
  const prefix = prefixParts.join("/");
  return { bucketName, prefix };
};

// Combined schema for final submission - AWS provider
const awsFormSchema = z.object({
  alias: aliasSchema,
  ownerScope: z.string().min(1, "Scope is required"),
  providerType: z.literal("aws"),
  provider: z.string().default(""),
  s3Uri: s3UriSchema,
  bucketRegion: z.string().min(1, "Region is required"),
  roleArn: z.string().regex(arnPattern, "Invalid AWS Role ARN format"),
  bucketEndpoint: z.string().default(""),
});

// Combined schema for final submission - Other provider
const otherFormSchema = z.object({
  alias: aliasSchema,
  ownerScope: z.string().min(1, "Scope is required"),
  providerType: z.literal("other"),
  provider: z.string().min(1, "Provider name is required"),
  s3Uri: s3UriSchema,
  bucketRegion: z.string().default(""),
  roleArn: z.string().default(""),
  bucketEndpoint: z.string().url("Invalid endpoint URL"),
});

// Discriminated union for type-safe conditional validation
export const connectBucketSchema = z.discriminatedUnion("providerType", [
  awsFormSchema,
  otherFormSchema,
]);

/** @deprecated Use `connectBucketSchema` — kept for backward-compatible imports. */
export const addConnectionSchema = connectBucketSchema;

export type ConnectBucketFormData = z.input<typeof connectBucketSchema>;
export type AddConnectionFormData = ConnectBucketFormData;

// Default values for the form
export const defaultFormValues: ConnectBucketFormData = {
  alias: "",
  ownerScope: "",
  providerType: "aws",
  provider: "",
  s3Uri: "",
  bucketRegion: "eu-central-1",
  roleArn: "",
  bucketEndpoint: "",
};
