import { z } from "zod";

/**
 * The provider catalog: the set of provider connections and provider roles an
 * organization may compose a storage connection from, plus the compute
 * providers, compute roles, and application catalogs that back the compute
 * plugin's host capabilities.
 *
 * A single schema describes both build sources so they stay interchangeable:
 * admin-portal builds read it from the portal lookup; OSS self-hosted builds
 * read it from a deploy-time YAML file. The shape mirrors the pinned lookup
 * JSON contract exactly — it never carries the Cytario Admin Role ARN, an
 * ExternalId, or any management credential.
 */

export const PROVIDER_TYPES = ["aws"] as const;
export type ProviderType = (typeof PROVIDER_TYPES)[number];

export const PROVIDER_CONNECTION_STATUSES = ["pending", "connected", "drifted", "error"] as const;
export type ProviderConnectionStatus = (typeof PROVIDER_CONNECTION_STATUSES)[number];

/**
 * The access level a provider role grants on a share — a single total-order
 * enum, not a (writeLevel, allowsSharing) pair, because a role that can author
 * the bucket policy can grant itself any data access the policy can express,
 * so a non-Admin level's data-access boundary is only meaningful if the role
 * cannot rewrite it. Defaults to `read-only` so catalog payloads predating the
 * field keep producing read-only grants.
 */
export const ACCESS_LEVELS = ["read-only", "annotate", "read-write", "admin"] as const;
export type AccessLevel = (typeof ACCESS_LEVELS)[number];

/** Whether a persisted grant's level string is one of the known access levels. */
export function isAccessLevel(value: string): value is AccessLevel {
  return (ACCESS_LEVELS as readonly string[]).includes(value);
}

export const providerConnectionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  providerType: z.enum(PROVIDER_TYPES),
  endpoint: z.string().nullable(),
  region: z.string().min(1),
  status: z.enum(PROVIDER_CONNECTION_STATUSES),
});

/**
 * A provisioned storage role. Identified by (provider connection, bucket,
 * access level) — exactly one is provisioned per (bucket, level) — so the row
 * carries no id or display name: grants reference the access level and the
 * concrete role is resolved server-side. `bucketIds` names the portal bucket
 * row ids the role is scoped to (empty in an OSS catalog without a bucket
 * registry).
 */
export const providerRoleSchema = z.object({
  providerConnectionId: z.string().min(1),
  roleArn: z.string().min(1),
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
     * server-side; they reach the compute plugin via the server-to-server
     * lookup but are never projected to the browser.
     */
    jobRoleArn: z.string().min(1),
    executionRoleArn: z.string().min(1),
    imagePullSecretRef: z.string().nullable(),
    logGroupName: z.string().min(1),
    defaultResources: z.record(z.string(), z.unknown()).nullable(),
    /**
     * Satisfiability ceiling the compute environment can place, stored as a
     * loose JSON object. Projected to the plugin via
     * `ComputeRoleSession.maxResources` so the pre-submit satisfiability check
     * rejects an unsatisfiable request instead of leaving a stuck `RUNNABLE`
     * job. Nullable because the admin-portal predates this field; a null
     * ceiling means the host cannot determine the maximum and the plugin
     * skips the check for that resource.
     */
    maxResources: z.record(z.string(), z.unknown()).nullable().optional(),
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

/**
 * The admin-portal lookup serializes an absent credential as JSON `null`, which
 * `.optional()` rejects. `z.preprocess` normalises it at the parse boundary
 * while keeping `.min(1)` in force and the output type `string | undefined`.
 */
function nullToUndefined(schema: z.ZodOptional<z.ZodString>) {
  return z.preprocess((v) => (v === null ? undefined : v), schema);
}

/**
 * The closed value set the portal may send. `github-packages` and `ecr-native`
 * stay in the enum so an unsupported kind degrades to an empty catalog instead
 * of failing the whole provider catalog parse (and with it storage connections).
 */
export const REGISTRY_KINDS = ["harbor", "oci-catalog", "github-packages", "ecr-native"] as const;
export type RegistryKind = (typeof REGISTRY_KINDS)[number];

export const appCatalogSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  registryEndpoint: z.string().min(1),
  namespace: z.string().min(1),
  /**
   * Absent (both or neither) means the catalog is credential-less and the host
   * omits the Authorization header entirely — an unauthenticated read of a private
   * registry fails closed with an empty catalog, never a wrong-credential leak.
   */
  accessAccountId: nullToUndefined(z.string().min(1).optional()),
  accessAccountSecret: nullToUndefined(z.string().min(1).optional()),
  enabled: z.boolean(),
  status: z.enum(CATALOG_STATUSES),
  /** Defaults to `"harbor"` so a portal response predating the field degrades to Harbor. */
  registryKind: z.enum(REGISTRY_KINDS).default("harbor"),
  /**
   * The catalog access-scope entitlement: zero or more organization group
   * paths a user must be a member of (at least one) to consume applications
   * from this catalog. An empty set means org-wide. The set is an attribute of
   * the catalog connection, not of the registry image, and is carried through
   * the server-to-server lookup so the compute plugin can filter the catalog
   * server-side.
   *
   * Defaults to an empty array so a portal response that predates this field
   * degrades to org-wide, never to deny-all.
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
export const clientProviderRoleSchema = providerRoleSchema.omit({
  roleArn: true,
});

/**
 * The catalog projection the browser receives. Role ARNs stay server-side — the
 * selectors need only the scope coverage, the access level, and the bucket ids.
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
      providerConnectionId: role.providerConnectionId,
      allowedScopes: role.allowedScopes,
      accessLevel: role.accessLevel,
      bucketIds: role.bucketIds,
    })),
  };
}
