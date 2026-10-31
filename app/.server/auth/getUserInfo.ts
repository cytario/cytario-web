import type { JWTPayload } from "jose";
import { z } from "zod";

import { getWellKnownEndpoints } from "./wellKnownEndpoints";
import type { Identity } from "@cytario/plugin-api";
import { ORG_ROOT_SCOPE } from "~/utils/authorization";

// Accept any value shape (`unknown`) so a Keycloak mapper quirk can't throw
// out of the whole parse and break login; only `groups` is consumed — other
// keys (incl. Keycloak's `id`) are opaque org attributes, dropped along with
// `groups` by normalizeOrganizationAttributes.
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

/** One Keycloak organization membership, sanitized for host and client use. */
export interface OrganizationMembership {
  /** Immutable Keycloak org id — absent when the membership mapper omits it. */
  id?: string;
  /** Group paths inside this org, with the leading `/` stripped. */
  groups: readonly string[];
  /** Opaque org attributes, PII/size-filtered; frozen. */
  attributes: Readonly<Record<string, readonly string[]>>;
}

/** Every membership the token carries, keyed by org alias. */
export type Organizations = Readonly<Record<string, OrganizationMembership>>;

export interface UserProfile extends Omit<UserProfileRaw, "organization"> {
  /** Active org alias — `undefined` for a zero-org session. */
  organization?: string;
  /** All memberships from the `organization` claim, active one included. */
  organizations: Organizations;
  /** Attributes of the ACTIVE org. */
  organizationAttributes: Readonly<Record<string, readonly string[]>>;
  groups: string[];
  adminScopes: string[];
}

// Hygiene so a mapper change can't leak PII to the client: attributes reach
// the browser via the Identity projection.
const EMAIL_SHAPED = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_ATTR_VALUE_BYTES = 256;
const attrEncoder = new TextEncoder();

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

// Frozen so a gate can't mutate the shared attributes.
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

// `id` surfaces array-shaped on some mapper configs; take the first usable value.
function readOrganizationId(entry: OrganizationEntry): string | undefined {
  const candidates = Array.isArray(entry.id) ? entry.id : [entry.id];
  const id = candidates.find((value): value is string => typeof value === "string" && value !== "");
  return id;
}

function normalizeOrganizations(claim: UserProfileRaw["organization"]): Organizations {
  const organizations: Record<string, OrganizationMembership> = {};
  for (const [alias, entry] of Object.entries(claim ?? {})) {
    const id = readOrganizationId(entry);
    organizations[alias] = Object.freeze({
      ...(id ? { id } : {}),
      groups: Object.freeze((entry.groups ?? []).map(normalizeGroup)),
      attributes: normalizeOrganizationAttributes(entry),
    });
  }
  return Object.freeze(organizations);
}

interface GroupDerivation {
  groups: string[];
  adminScopes: string[];
}

// Root `/admins` becomes the `*` admin scope — "admin of every owner scope in
// this org", still bounded by the tenant check (no cross-org power).
function deriveGroupScopes(rawGroups: readonly string[]): GroupDerivation {
  const allGroups = rawGroups.map(normalizeGroup);
  const adminScopes = allGroups
    .filter((g) => g === "admins" || g.endsWith("/admins"))
    .map((g) => (g === "admins" ? ORG_ROOT_SCOPE : g.replace(/\/admins$/, "")));
  const groups = allGroups.filter((g) => g !== "admins" && !g.endsWith("/admins"));
  return { groups, adminScopes };
}

/**
 * Deterministic active-org pick: the caller's preferred alias (last used) when
 * the token still carries that membership, else the first alias alphabetically.
 * Returns `undefined` for a zero-org session.
 */
export function resolveActiveOrganization(
  organizations: Organizations,
  preferredAlias?: string,
): string | undefined {
  const aliases = Object.keys(organizations).sort();
  if (preferredAlias && aliases.includes(preferredAlias)) return preferredAlias;
  return aliases[0];
}

/**
 * Re-derives the active-org projection (groups, admin scopes, attributes) for
 * `alias`. An alias outside the memberships clears the projection entirely
 * rather than keeping the previous org's, so a session can never carry one
 * tenant's entitlements under another's alias.
 */
export function withActiveOrganization(user: UserProfile, alias: string | undefined): UserProfile {
  const membership = alias ? user.organizations[alias] : undefined;
  if (!alias || !membership) {
    return {
      ...user,
      organization: undefined,
      organizationAttributes: Object.freeze({}),
      groups: [],
      adminScopes: [],
    };
  }
  const { groups, adminScopes } = deriveGroupScopes(membership.groups);
  return {
    ...user,
    organization: alias,
    organizationAttributes: membership.attributes,
    groups,
    adminScopes,
  };
}

function enrichUserProfile(raw: UserProfileRaw, preferredAlias?: string): UserProfile {
  const organizations = normalizeOrganizations(raw.organization);
  const organization = resolveActiveOrganization(organizations, preferredAlias);
  const activeMembership = organization ? organizations[organization] : undefined;

  const { groups, adminScopes } = deriveGroupScopes(activeMembership?.groups ?? raw.groups);

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
    organizations,
    organizationAttributes: activeMembership?.attributes ?? Object.freeze({}),
    groups,
    adminScopes,
  };
}

/**
 * Drops PII so it never reaches the client. `organizations` is absent from the
 * plugin-api `Identity` contract, so the multi-org map stays host-side until
 * that interface grows one.
 */
export function toIdentity(user: UserProfile): Identity {
  // Frozen — gates share this object; none may mutate it.
  return Object.freeze({
    sub: user.sub,
    organization: user.organization,
    organizationAttributes: user.organizationAttributes,
    groups: user.groups,
    adminScopes: user.adminScopes,
  });
}

// Group membership arrives nested under the organization claim (Keycloak
// Organizations), not as a top-level `groups` claim; identity-display fields
// default when absent. Returns null when the claims do not parse.
export function profileFromTokenClaims(
  claims: JWTPayload,
  preferredAlias?: string,
): UserProfile | null {
  const tokenClaimsSchema = userProfileSchema.extend({
    email_verified: z.boolean().default(false),
    name: z.string().default(""),
    preferred_username: z.string().default(""),
    given_name: z.string().default(""),
    family_name: z.string().default(""),
    email: z.string().default(""),
  });
  const parsed = tokenClaimsSchema.safeParse(claims);
  if (!parsed.success) return null;
  return enrichUserProfile(parsed.data, preferredAlias);
}

export const getUserInfo = async (
  accessToken: string,
  preferredAlias?: string,
): Promise<UserProfile> => {
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
    const enrichedUserProfile = enrichUserProfile(validatedUserProfile, preferredAlias);

    return enrichedUserProfile;
  } catch (error) {
    console.error("Keycloak getUserInfo failed:", error);
    throw error;
  }
};
