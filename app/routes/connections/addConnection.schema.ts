import { z } from "zod";

// Connection name: 2-60 chars, alphanumeric + hyphens + spaces,
// no leading/trailing hyphens or spaces, no consecutive hyphens or spaces
export const connectionNameSchema = z
  .string()
  .min(2, "Name must be at least 2 characters")
  .max(60, "Name must be at most 60 characters")
  .regex(
    /^[a-zA-Z0-9][a-zA-Z0-9 -]*[a-zA-Z0-9]$/,
    "Name must be alphanumeric with hyphens or spaces, no leading/trailing hyphens or spaces",
  )
  .refine(
    (val) => !val.includes("--"),
    "Name must not contain consecutive hyphens",
  )
  .refine(
    (val) => !val.includes("  "),
    "Name must not contain consecutive spaces",
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

/** Auto-suggest a connection name from an S3 URI (e.g. "s3://my-bucket/path" → "my-bucket"). */
export function suggestName(s3Uri: string): string {
  const { bucketName, prefix } = parseS3Uri(s3Uri);
  const lastSegment = prefix
    .replace(/\/$/, "")
    .split("/")
    .filter(Boolean)
    .pop();
  const base = lastSegment ? `${bucketName} ${lastSegment}` : bucketName;
  return base
    .replace(/[^a-zA-Z0-9 -]/g, " ")
    .replace(/ +/g, " ")
    .replace(/-+/g, "-")
    .replace(/^[- ]|[- ]$/g, "")
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
  name: connectionNameSchema,
  ownerScope: z.string().min(1, "Scope is required"),
  providerType: z.literal("aws"),
  s3Uri: s3UriSchema,
  bucketRegion: z.string().min(1, "Region is required"),
  roleArn: z.string().regex(arnPattern, "Invalid AWS Role ARN format"),
  bucketEndpoint: z.string().default(""),
});

// Combined schema for final submission - MinIO provider
const minioFormSchema = z.object({
  name: connectionNameSchema,
  ownerScope: z.string().min(1, "Scope is required"),
  providerType: z.literal("minio"),
  s3Uri: s3UriSchema,
  bucketRegion: z.string().default(""),
  roleArn: z.string().default(""),
  bucketEndpoint: z.string().url("Invalid endpoint URL"),
});

// Discriminated union for type-safe conditional validation
export const connectBucketSchema = z.discriminatedUnion("providerType", [
  awsFormSchema,
  minioFormSchema,
]);

export type ConnectBucketFormData = z.input<typeof connectBucketSchema>;

// Default values for the form
export const defaultFormValues: ConnectBucketFormData = {
  name: "",
  ownerScope: "",
  providerType: "aws",
  s3Uri: "",
  bucketRegion: "eu-central-1",
  roleArn: "",
  bucketEndpoint: "",
};
