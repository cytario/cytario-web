import { z } from "zod";

/**
 * The portal bucket catalog: the registered buckets an organization may
 * connect to, resolved from the admin portal's `GET /org/buckets` lookup.
 * Present only in admin-portal builds (EE & SaaS); OSS self-hosted builds
 * have no portal and the bucket is entered as free text.
 *
 * The shape mirrors the pinned lookup JSON contract exactly. It never carries
 * the Cytario Admin Role ARN, an ExternalId, or any management credential.
 */
export const bucketLookupRowSchema = z.object({
  id: z.string().min(1),
  providerConnectionId: z.string().min(1),
  bucketName: z.string().min(1),
  region: z.string().min(1),
});

export const bucketCatalogSchema = z.object({
  buckets: z.array(bucketLookupRowSchema),
});

export type BucketLookupRow = z.infer<typeof bucketLookupRowSchema>;
export type BucketCatalog = z.infer<typeof bucketCatalogSchema>;
