import { z } from "zod";

/**
 * The provider catalog: the set of provider connections and provider roles an
 * organization may compose a storage connection from.
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

export const providerConnectionSchema = z.object({
  id: z.string().min(1),
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
  allowsSharing: z.boolean(),
});

export const providerCatalogSchema = z.object({
  providerConnections: z.array(providerConnectionSchema),
  providerRoles: z.array(providerRoleSchema),
});

export type ProviderConnection = z.infer<typeof providerConnectionSchema>;
export type ProviderRole = z.infer<typeof providerRoleSchema>;
export type ProviderCatalog = z.infer<typeof providerCatalogSchema>;

/** A provider role as exposed to the browser: no cloud role identifier. */
export const clientProviderRoleSchema = providerRoleSchema.omit({ roleArn: true });

/**
 * The catalog projection the browser receives. Role ARNs stay server-side — the
 * selectors need only ids, names, scope coverage, and the sharing capability.
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
      allowsSharing: role.allowsSharing,
    })),
  };
}
