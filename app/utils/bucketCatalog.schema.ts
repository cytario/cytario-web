import { z } from "zod";

/**
 * The portal bucket catalog (admin-portal builds only; OSS builds enter the
 * bucket as free text). Shape mirrors the pinned lookup JSON contract exactly —
 * it never carries the Cytario Admin Role ARN, an ExternalId, or any
 * management credential.
 */
export const bucketLookupRowSchema = z.object({
  id: z.string().min(1),
  providerConnectionId: z.string().min(1),
  bucketName: z.string().min(1),
  region: z.string().min(1),
  kmsKeyArn: z.string().nullable().optional(),
});

export const bucketCatalogSchema = z.object({
  buckets: z.array(bucketLookupRowSchema),
});

export type BucketLookupRow = z.infer<typeof bucketLookupRowSchema>;
export type BucketCatalog = z.infer<typeof bucketCatalogSchema>;
