import { z } from "zod";

import { getWellKnownEndpoints } from "./wellKnownEndpoints";

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

export type UserProfile = z.infer<typeof userProfileSchema>;

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

    return userProfileSchema.parse(await response.json());
  } catch (error) {
    console.error("Keycloak getUserInfo failed:", error);
    throw error;
  }
};
