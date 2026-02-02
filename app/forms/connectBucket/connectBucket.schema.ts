import { z } from "zod";

// AWS ARN pattern validation
const arnPattern = /^arn:aws:iam::\d{12}:role\/[\w+=,.@-]+$/;

// Combined schema for final submission - AWS provider
const awsFormSchema = z.object({
  providerType: z.literal("aws"),
  provider: z.string().default(""),
  bucketName: z.string().min(1, "Bucket name is required"),
  prefix: z.string().default(""),
  bucketRegion: z.string().min(1, "Region is required"),
  roleArn: z.string().regex(arnPattern, "Invalid AWS Role ARN format"),
  bucketEndpoint: z.string().default(""),
});

// Combined schema for final submission - Other provider
const otherFormSchema = z.object({
  providerType: z.literal("other"),
  provider: z.string().min(1, "Provider name is required"),
  bucketName: z.string().min(1, "Bucket name is required"),
  prefix: z.string().default(""),
  bucketRegion: z.string().default(""),
  roleArn: z.string().default(""),
  bucketEndpoint: z.string().url("Invalid endpoint URL"),
});

// Discriminated union for type-safe conditional validation
export const connectBucketSchema = z.discriminatedUnion("providerType", [
  awsFormSchema,
  otherFormSchema,
]);

export type ConnectBucketFormData = z.input<typeof connectBucketSchema>;

// Default values for the form
export const defaultFormValues: ConnectBucketFormData = {
  providerType: "aws",
  provider: "",
  bucketName: "",
  prefix: "",
  bucketRegion: "eu-central-1",
  roleArn: "",
  bucketEndpoint: "",
};
