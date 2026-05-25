import { z } from "zod";

import { getWellKnownEndpoints } from "./wellKnownEndpoints";
import { ORG_ROOT_SCOPE } from "~/utils/authorization";

const organizationClaimSchema = z
  .record(
    z.string(),
    z.object({
      groups: z.array(z.string()).default([]),
    }),
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
  groups: string[];
  adminScopes: string[];
}

/** Removes leading slash from group name. */
function normalizeGroup(group: string): string {
  return group.replace(/^\//, "");
}

/** Enriches raw user profile with admin scopes. */
function enrichUserProfile(raw: UserProfileRaw): UserProfile {
  // Keycloak Organizations claim is `{ "<alias>": { groups: [...] } }` with
  // exactly one key. Group membership now arrives nested under that key.
  const orgEntry = raw.organization ? Object.entries(raw.organization)[0] : undefined;
  const organization = orgEntry?.[0];
  const rawGroups = orgEntry ? (orgEntry[1].groups ?? []) : raw.groups;

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
    groups,
    adminScopes,
  };
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
