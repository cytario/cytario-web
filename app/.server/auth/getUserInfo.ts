import { z } from "zod";

import { getWellKnownEndpoints } from "./wellKnownEndpoints";
import type { Identity } from "@cytario/plugin-api";
import { ORG_ROOT_SCOPE } from "~/utils/authorization";

// Keycloak nests everything under the org alias key. `id` and `groups` are the
// host-owned fields; every other key is an opaque, multivalued attribute the
// host does not interpret (the SaaS plugin narrows them to its own billing
// types). Pass the attribute bag through unmodelled — bake no billing key
// names into the schema.
// Attribute values arrive multivalued (string arrays), but a mapper config can
// also emit a single-valued attr as a bare scalar, and `id` can surface either
// shape. Accept any value shape for `id` and the attr bag so a quirk never
// throws out of the whole parse and breaks login (a logout loop) —
// `collapseOrganizationAttributes` normalizes and drops non-string values
// downstream.
const organizationClaimSchema = z
  .record(
    z.string(),
    z
      .object({
        id: z.unknown().optional(),
        groups: z.array(z.string()).default([]),
      })
      .catchall(z.unknown()),
  )
  .optional();

const userProfileSchema = z.object({
  sub: z.string(),
  email_verified: z.boolean(),
  name: z.string(),
  preferred_username: z.string(),
  given_name: z.string(),
  family_name: z.string(),
  email: z.string(),
  policy: z.array(z.string()).default([]),
  groups: z.array(z.string()).default([]),
  organization: organizationClaimSchema,
});

type UserProfileRaw = z.infer<typeof userProfileSchema>;

export interface UserProfile extends Omit<UserProfileRaw, "organization"> {
  /** Active Keycloak organization alias for this session. Undefined for zero-org users. */
  organization?: string;
  /**
   * Opaque org attributes mirrored into the token. Each multivalued attr is
   * collapsed to its first value; empty/non-string, oversized, and email-shaped
   * values are dropped (host-side hygiene). Frozen at runtime.
   */
  organizationAttributes: Readonly<Record<string, string>>;
  groups: string[];
  adminScopes: string[];
}

// Defence-in-depth on the opaque attribute mirror: the host stays
// billing-agnostic, but a future Keycloak mapper change must not silently ship
// PII or payment identifiers to the browser. Drop email-shaped and oversized
// values. Vocabulary-free — no attribute key is interpreted. The primary
// control lives portal-side (which attrs are mirrored at all).
const EMAIL_SHAPED = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_ATTR_VALUE_BYTES = 256;
const attrEncoder = new TextEncoder();

/** Removes leading slash from group name. */
function normalizeGroup(group: string): string {
  return group.replace(/^\//, "");
}

type OrganizationEntry = NonNullable<UserProfileRaw["organization"]>[string];

/**
 * Collapses Keycloak attribute values to a single string, dropping host-owned
 * keys (`id`, `groups`). A scalar collapses to itself; an array to its first
 * element. Empty/non-string, oversized (>256B), and email-shaped values are
 * dropped. Returns a frozen map so a misbehaving gate cannot mutate the shared
 * attributes downstream.
 */
function collapseOrganizationAttributes(
  entry: OrganizationEntry,
): Readonly<Record<string, string>> {
  const attributes: Record<string, string> = {};
  for (const [key, value] of Object.entries(entry)) {
    if (key === "id" || key === "groups") continue;
    const collapsed =
      typeof value === "string"
        ? value
        : Array.isArray(value) && typeof value[0] === "string"
          ? value[0]
          : undefined;
    if (collapsed === undefined) continue;
    if (attrEncoder.encode(collapsed).length > MAX_ATTR_VALUE_BYTES) continue;
    if (EMAIL_SHAPED.test(collapsed)) continue;
    attributes[key] = collapsed;
  }
  return Object.freeze(attributes);
}

/** Enriches raw user profile with admin scopes. */
function enrichUserProfile(raw: UserProfileRaw): UserProfile {
  // Keycloak Organizations claim is `{ "<alias>": { id, groups, ...attrs } }`
  // with exactly one key. Group membership and org attributes arrive nested
  // under that key.
  const orgEntry = raw.organization ? Object.entries(raw.organization)[0] : undefined;
  const organization = orgEntry?.[0];
  const rawGroups = orgEntry ? (orgEntry[1].groups ?? []) : raw.groups;
  const organizationAttributes = orgEntry
    ? collapseOrganizationAttributes(orgEntry[1])
    : Object.freeze({});

  // Root `/admins` becomes the `*` admin scope. `authorization.ts` treats `*`
  // as "admin of every owner scope in this org" — still bounded by the tenant
  // check, so it grants no cross-org power.
  const allGroups = rawGroups.map(normalizeGroup);
  const adminScopes = allGroups
    .filter((g) => g === "admins" || g.endsWith("/admins"))
    .map((g) => (g === "admins" ? ORG_ROOT_SCOPE : g.replace(/\/admins$/, "")));
  const groups = allGroups.filter((g) => g !== "admins" && !g.endsWith("/admins"));

  return {
    sub: raw.sub,
    email: raw.email,
    email_verified: raw.email_verified,
    name: raw.name,
    preferred_username: raw.preferred_username,
    given_name: raw.given_name,
    family_name: raw.family_name,
    policy: raw.policy,
    organization,
    organizationAttributes,
    groups,
    adminScopes,
  };
}

/**
 * Projects a `UserProfile` to the contract's `Identity`, dropping PII (`name`,
 * `email`, `preferred_username`, `policy`). Gates and slots receive this
 * projection only, so PII never crosses to the client loader payload.
 */
export function toIdentity(user: UserProfile): Identity {
  // Frozen so a gate cannot mutate the projection shared across the gate chain.
  return Object.freeze({
    organization: user.organization,
    organizationAttributes: user.organizationAttributes,
    groups: user.groups,
    adminScopes: user.adminScopes,
  });
}

/** Retrieves and enriches user profile data from Keycloak. */
export const getUserInfo = async (accessToken: string): Promise<UserProfile> => {
  try {
    const wellKnownEndpoints = await getWellKnownEndpoints();
    const { userinfo_endpoint } = wellKnownEndpoints;

    const response = await fetch(userinfo_endpoint, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`UserInfo fetch failed: ${response.status} - ${errorText}`);
    }

    const rawUserProfile = await response.json();
    const validatedUserProfile = userProfileSchema.parse(rawUserProfile);
    const enrichedUserProfile = enrichUserProfile(validatedUserProfile);

    return enrichedUserProfile;
  } catch (error) {
    console.error("Keycloak getUserInfo failed:", error);
    throw error;
  }
};
