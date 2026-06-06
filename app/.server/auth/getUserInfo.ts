import { z } from "zod";

import { getWellKnownEndpoints } from "./wellKnownEndpoints";
import type { Identity } from "@cytario/plugin-api";
import { ORG_ROOT_SCOPE } from "~/utils/authorization";

// Only `groups` is consumed; other keys (incl. Keycloak's `id`) are opaque org
// attributes. Accept any value shape (`unknown`) so a Keycloak mapper quirk
// can't throw out of the whole parse and break login;
// normalizeOrganizationAttributes drops `id`/`groups` and cleans the rest.
const organizationClaimSchema = z
  .record(
    z.string(),
    z
      .object({
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
  /** Opaque, multivalued org attributes; frozen. Host assigns no meaning to keys. */
  organizationAttributes: Readonly<Record<string, readonly string[]>>;
  groups: string[];
  adminScopes: string[];
}

// Hygiene so a mapper change can't leak PII to the client: drop email-shaped and
// oversized values. Attributes reach the browser via the Identity projection.
const EMAIL_SHAPED = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_ATTR_VALUE_BYTES = 256;
const attrEncoder = new TextEncoder();

/** Removes leading slash from group name. */
function normalizeGroup(group: string): string {
  return group.replace(/^\//, "");
}

type OrganizationEntry = NonNullable<UserProfileRaw["organization"]>[string];

/** Drop non-string, oversized (>256B), and email-shaped values (host hygiene). */
function isAllowedAttrValue(value: unknown): value is string {
  return (
    typeof value === "string" &&
    attrEncoder.encode(value).length <= MAX_ATTR_VALUE_BYTES &&
    !EMAIL_SHAPED.test(value)
  );
}

/**
 * Build the opaque attribute map: drop host-owned `id`/`groups`, wrap scalars to
 * arrays, keep allowed string values, omit now-empty keys. Frozen so a gate
 * can't mutate the shared attributes.
 */
function normalizeOrganizationAttributes(
  entry: OrganizationEntry,
): Readonly<Record<string, readonly string[]>> {
  const attributes: Record<string, readonly string[]> = {};
  for (const [key, value] of Object.entries(entry)) {
    if (key === "id" || key === "groups") continue;
    const raw = Array.isArray(value) ? value : [value];
    const allowed = raw.filter(isAllowedAttrValue);
    if (allowed.length === 0) continue;
    attributes[key] = Object.freeze(allowed);
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
    ? normalizeOrganizationAttributes(orgEntry[1])
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

/** Projects `UserProfile` to the contract's `Identity`, dropping PII so it never reaches the client. */
export function toIdentity(user: UserProfile): Identity {
  // Frozen — gates share this object; none may mutate it.
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
