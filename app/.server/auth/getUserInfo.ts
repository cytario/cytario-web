import { getWellKnownEndpoints } from "./wellKnownEndpoints";

// TODO: pass via env
const REALM_ADMIN_GROUP = "cytario/admins";

interface UserProfileRaw {
  sub: string; // uuid
  email_verified: boolean;
  name: string;
  preferred_username: string;
  given_name: string;
  family_name: string;
  email: string;
  groups: string[];
  policy: string;
}

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

/** Fetches user profile from Keycloak userinfo endpoint. */
async function fetchUserProfile(accessToken: string): Promise<UserProfileRaw> {
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

  return await response.json();
}

/** Retrieves and enriches user profile data from Keycloak. */
export const getUserInfo = async (
  accessToken: string,
): Promise<UserProfile> => {
  try {
    const userProfileRaw = await fetchUserProfile(accessToken);
    const userProfile = enrichUserProfile(userProfileRaw);
    return userProfile;
  } catch (error) {
    console.error("Keycloak getUserInfo failed:", error);
    throw error;
  }
};
