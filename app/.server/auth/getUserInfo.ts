import { z } from "zod";

import { getWellKnownEndpoints } from "./wellKnownEndpoints";

// TODO: pass via env
const REALM_ADMIN_GROUP = "cytario/admins";

const userProfileSchema = z.object({
  sub: z.string(),
  email_verified: z.boolean(),
  name: z.string(),
  preferred_username: z.string(),
  given_name: z.string(),
  family_name: z.string(),
  email: z.string(),
  policy: z.array(z.string()),
  groups: z.array(z.string()),
});

type UserProfileRaw = z.infer<typeof userProfileSchema>;

export interface UserProfile extends UserProfileRaw {
  groups: string[];
  adminScopes: string[];
  isRealmAdmin: boolean;
}

/** Removes leading slash from group name. */
function normalizeGroup(group: string): string {
  return group.replace(/^\//, "");
}

/** Enriches raw user profile with admin scopes and realm admin status. */
function enrichUserProfile(raw: UserProfileRaw): UserProfile {
  const allGroups = ((raw.groups as string[]) ?? []).map(normalizeGroup);
  const adminScopes = allGroups
    .filter((g) => g.endsWith("/admins"))
    .map((g) => g.replace(/\/admins$/, ""));
  const isRealmAdmin = allGroups.includes(REALM_ADMIN_GROUP);
  const groups = allGroups.filter((g) => !g.endsWith("/admins"));

  return {
    ...(raw as unknown as UserProfile),
    groups,
    adminScopes,
    isRealmAdmin,
  };
}

/** Retrieves and enriches user profile data from Keycloak. */
export const getUserInfo = async (
  accessToken: string,
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
      throw new Error(
        `UserInfo fetch failed: ${response.status} - ${errorText}`,
      );
    }

    const raw = userProfileSchema.parse(await response.json());
    return enrichUserProfile(raw);
  } catch (error) {
    console.error("Keycloak getUserInfo failed:", error);
    throw error;
  }
};
