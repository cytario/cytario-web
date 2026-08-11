import { z } from "zod";

/**
 * The provider catalog: the set of provider connections and provider roles an
 * organization may compose a storage connection from, plus the compute
 * providers, compute roles, and application catalogs that back the compute
 * plugin's host capabilities.
 *
 * A single schema describes both build sources so they stay interchangeable:
 *  - admin-portal builds (EE/SaaS) read it from the portal lookup
 *    (`GET {PORTAL_INTERNAL_URL}/org/providers`);
 *  - OSS self-hosted builds read it from a deploy-time YAML file.
 *
 * The shape mirrors the pinned lookup JSON contract exactly. It never carries the
 * Cytario Admin Role ARN, an ExternalId, or any management credential.
 */

export const PROVIDER_TYPES = ["aws"] as const;
export type ProviderType = (typeof PROVIDER_TYPES)[number];

export const PROVIDER_CONNECTION_STATUSES = ["pending", "connected", "drifted", "error"] as const;
export type ProviderConnectionStatus = (typeof PROVIDER_CONNECTION_STATUSES)[number];

/**
 * The access level a provider role grants on a share — a single total-order
 * enum (not a (writeLevel, allowsSharing) pair, because a role that can author
 * the bucket policy can grant itself any data access the bucket policy can
 * express, so a non-Admin level's data-access boundary is only meaningful if
 * the role cannot rewrite it). Drives the bucket-policy generator's
 * object-statement action set. Defaults to `read-only` so existing catalog
 * payloads (OSS YAML, portal lookup) that predate the field keep producing
 * read-only grants until they explicitly declare a higher level.
 */
export const ACCESS_LEVELS = ["read-only", "annotate", "read-write", "admin"] as const;
export type AccessLevel = (typeof ACCESS_LEVELS)[number];

export const providerConnectionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  providerType: z.enum(PROVIDER_TYPES),
  endpoint: z.string().nullable(),
  region: z.string().min(1),
  status: z.enum(PROVIDER_CONNECTION_STATUSES),
});

export const providerRoleSchema = z.object({
  id: z.string().min(1),
  providerConnectionId: z.string().min(1),
  roleArn: z.string().min(1),
  name: z.string().min(1),
  allowedScopes: z.array(z.string()),
  accessLevel: z.enum(ACCESS_LEVELS).default("read-only"),
  bucketIds: z.array(z.string()).default([]),
});

export const COMPUTE_PROVIDER_TYPES = ["AWS_BATCH"] as const;
export type ComputeProviderType = (typeof COMPUTE_PROVIDER_TYPES)[number];

export const COMPUTE_PROVIDER_STATUSES = ["pending", "connected", "drifted", "error"] as const;
export type ComputeProviderStatus = (typeof COMPUTE_PROVIDER_STATUSES)[number];

export const computeProviderSchema = z.object({
  id: z.string().min(1),
  providerConnectionId: z.string().min(1),
  displayName: z.string().min(1),
  region: z.string().min(1),
  type: z.enum(COMPUTE_PROVIDER_TYPES),
  typeSpecific: z.object({
    jobQueueArn: z.string().min(1),
    /**
     * Job-role and execution-role ARNs are management data used only
     * server-side (SRS-CY-49110). They are returned to cytario-web via the
     * server-to-server lookup so the compute plugin can construct the provider
     * job-definition on demand (SRS-CY-415109), but are never projected to
     * the browser.
     */
    jobRoleArn: z.string().min(1),
    executionRoleArn: z.string().min(1),
    imagePullSecretRef: z.string().nullable(),
    logGroupName: z.string().min(1),
    defaultResources: z.record(z.string(), z.unknown()).nullable(),
  }),
  status: z.enum(COMPUTE_PROVIDER_STATUSES),
});

export const computeRoleSchema = z.object({
  id: z.string().min(1),
  computeProviderId: z.string().min(1),
  roleArn: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable(),
  allowedScopes: z.array(z.string()),
});

export const CATALOG_STATUSES = ["pending", "connected", "error"] as const;
export type CatalogStatus = (typeof CATALOG_STATUSES)[number];

export const appCatalogSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  registryEndpoint: z.string().min(1),
  namespace: z.string().min(1),
  accessAccountId: z.string().min(1),
  accessAccountSecret: z.string().min(1),
  enabled: z.boolean(),
  status: z.enum(CATALOG_STATUSES),
  /**
   * The catalog access-scope entitlement (SRS-CY-39806): zero or more
   * organization group paths a user must be a member of (at least one) to
   * consume applications from this catalog. An empty set means org-wide —
   * any organization member may consume. The set is an attribute of the
   * catalog connection, not of the registry image, and is carried through
   * the server-to-server `/org/providers` lookup (SRS-CY-45107) so the
   * compute plugin can filter the catalog server-side.
   *
   * Defaults to an empty array so a portal response that predates this
   * field degrades to org-wide (SRS-CY-39806), never to deny-all.
   */
  allowedGroups: z.array(z.string()).default([]),
});

export const providerCatalogSchema = z.object({
  providerConnections: z.array(providerConnectionSchema),
  providerRoles: z.array(providerRoleSchema),
  computeProviders: z.array(computeProviderSchema).default([]),
  computeRoles: z.array(computeRoleSchema).default([]),
  appCatalogs: z.array(appCatalogSchema).default([]),
});

export type ProviderConnection = z.infer<typeof providerConnectionSchema>;
export type ProviderRole = z.infer<typeof providerRoleSchema>;
export type ComputeProvider = z.infer<typeof computeProviderSchema>;
export type ComputeRole = z.infer<typeof computeRoleSchema>;
export type AppCatalog = z.infer<typeof appCatalogSchema>;
export type ProviderCatalog = z.infer<typeof providerCatalogSchema>;

/** A provider role as exposed to the browser: no cloud role identifier. */
export const clientProviderRoleSchema = providerRoleSchema.omit({ roleArn: true });

/**
 * The catalog projection the browser receives. Role ARNs stay server-side — the
 * selectors need only ids, names, scope coverage, and the access level.
 */
export const clientProviderCatalogSchema = z.object({
  providerConnections: z.array(providerConnectionSchema),
  providerRoles: z.array(clientProviderRoleSchema),
});

export type ClientProviderRole = z.infer<typeof clientProviderRoleSchema>;
export type ClientProviderCatalog = z.infer<typeof clientProviderCatalogSchema>;

/** Project a full catalog to its browser-safe shape. */
export function toClientCatalog(catalog: ProviderCatalog): ClientProviderCatalog {
  return {
    providerConnections: catalog.providerConnections,
    providerRoles: catalog.providerRoles.map((role) => ({
      id: role.id,
      providerConnectionId: role.providerConnectionId,
      name: role.name,
      allowedScopes: role.allowedScopes,
      accessLevel: role.accessLevel,
      bucketIds: role.bucketIds,
    })),
  };
}
