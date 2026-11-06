import { decodeJwt, type JWTPayload } from "jose";
import { z } from "zod";

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
  /** All memberships from the `organization` claim — the authoritative org
   * source. Which org a request acts in is request-local (URL), never stored
   * here. */
  organizations: Organizations;
  /** Attributes of the org the profile is projected to (request-local). */
  organizationAttributes: Readonly<Record<string, readonly string[]>>;
  /** Group paths of the org the profile is projected to (request-local). */
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
 * Re-derives the org projection (groups, admin scopes, attributes) for
 * `alias`. An alias outside the memberships clears the projection entirely
 * rather than keeping another org's, so a request can never carry one
 * tenant's entitlements under another's alias. The alias itself is not
 * stored on the profile — the caller knows what it projected to.
 */
export function withActiveOrganization(user: UserProfile, alias: string | undefined): UserProfile {
  const membership = alias ? user.organizations[alias] : undefined;
  if (!alias || !membership) {
    return {
      ...user,
      organizationAttributes: Object.freeze({}),
      groups: [],
      adminScopes: [],
    };
  }
  const { groups, adminScopes } = deriveGroupScopes(membership.groups);
  return {
    ...user,
    organizationAttributes: membership.attributes,
    groups,
    adminScopes,
  };
}

function enrichUserProfile(raw: UserProfileRaw): UserProfile {
  const organizations = normalizeOrganizations(raw.organization);

  // A member-of-nothing profile means the token's `organization` claim is
  // absent, misshapen, or empty — every user is a member of ≥1 org. Without
  // this line the zero-org 401/onboarding funnel looks like an onboarding
  // problem when the actual cause is realm mapper drift after a deploy.
  if (Object.keys(organizations).length === 0) {
    console.warn(
      `[auth] Token carries no usable organization membership (sub: ${raw.sub}) — the \`organization\` claim is absent or misshapen; check the realm's organization-membership mapper`,
    );
  }

  // Org-neutral: memberships only. The request-org projection (groups,
  // scopes, attributes) is applied per request; the stored session user never
  // carries one org's entitlements over another's.
  return {
    sub: raw.sub,
    email: raw.email,
    email_verified: raw.email_verified,
    name: raw.name,
    preferred_username: raw.preferred_username,
    given_name: raw.given_name,
    family_name: raw.family_name,
    policy: raw.policy,
    organizations,
    organizationAttributes: Object.freeze({}),
    groups: [],
    adminScopes: [],
  };
}

/**
 * Drops PII so it never reaches the client. `organizations` is absent from the
 * plugin-api `Identity` contract, so the multi-org map stays host-side until
 * that interface grows one.
 */
export function toIdentity(user: UserProfile, organization: string | undefined): Identity {
  // Frozen — gates share this object; none may mutate it. `organization` is the
  // request org; the profile carries only the membership map.
  return Object.freeze({
    sub: user.sub,
    organization,
    organizationAttributes: user.organizationAttributes,
    groups: user.groups,
    adminScopes: user.adminScopes,
  });
}

// Group membership arrives nested under the organization claim (Keycloak
// Organizations), not as a top-level `groups` claim; identity-display fields
// default when absent. Returns null when the claims do not parse.
export function profileFromTokenClaims(claims: JWTPayload): UserProfile | null {
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
  return enrichUserProfile(parsed.data);
}

/** Reads the (unverified) claims of a token this server received directly
 * from Keycloak — minted-by-us trust: the caller holds a token the realm
 * just issued over TLS; decode-only reads its claims without re-verifying.
 * A malformed token reads as {} — callers fall back to the stored profile
 * rather than failing the request. */
export function decodeJwtClaims(token: string): Record<string, unknown> {
  try {
    return decodeJwt(token) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/**
 * The session profile at login, derived from the access token issued in the
 * same auth-code response — the exact claim set and code path the refresh
 * path re-derives from mid-session, so a claim-shape change manifests
 * identically at session birth and at refresh. No userinfo round-trip:
 * login keeps its latency to the token-issuance hop, and a Keycloak userinfo
 * outage cannot block new sessions while token issuance still works.
 *
 * Trust: the token arrives directly from Keycloak's token endpoint over TLS
 * in this flow (minted-for-us), matching the refresh path's decode-only
 * posture. A malformed token reads as {} (decodeJwtClaims) and the schema
 * then yields null — the caller surfaces the failed-login notification.
 */
export function profileFromAccessToken(accessToken: string): UserProfile | null {
  return profileFromTokenClaims(decodeJwtClaims(accessToken));
}
