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

function normalizeGroup(group: string): string {
  return group.replace(/^\//, "");
}

function enrichUserProfile(raw: UserProfileRaw): UserProfile {
  const groups = ((raw.groups as string[]) ?? []).map(normalizeGroup);
  const adminScopes = groups
    .filter((g) => g.endsWith("/admins"))
    .map((g) => g.replace(/\/admins$/, ""));
  const isRealmAdmin = groups.includes(REALM_ADMIN_GROUP);

  return {
    ...(raw as unknown as UserProfile),
    groups,
    adminScopes,
    isRealmAdmin,
  };
}

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
