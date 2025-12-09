import { getWellKnownEndpoints } from "./wellKnownEndpoints";

export interface UserProfile {
  sub: string; // uuid
  email_verified: boolean;
  name: string;
  preferred_username: string;
  given_name: string;
  family_name: string;
  email: string;
  policy: string;
  groups: string[];
}

export const getUserInfo = async (
  accessToken: string
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
        `UserInfo fetch failed: ${response.status} - ${errorText}`
      );
    }

    return (await response.json()) as UserProfile;
  } catch (error) {
    console.error("Keycloak getUserInfo failed:", error);
    throw error;
  }
};
