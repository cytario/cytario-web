import { adminFetch, adminMutate, type KeycloakUser } from "./client";
import { findGroupByPath } from "./groups";

export async function inviteUser(
  accessToken: string,
  email: string,
  firstName: string,
  lastName: string,
  groupPath: string,
): Promise<void> {
  const group = await findGroupByPath(accessToken, groupPath);
  if (!group) throw new Error(`Group not found: ${groupPath}`);

  let userId: string;
  let isNewUser = true;
  try {
    const res = await adminMutate(accessToken, "POST", "/users", {
      username: email,
      email,
      firstName,
      lastName,
      enabled: true,
    });
    const location = res.headers.get("location");
    if (!location) throw new Error("Missing Location header");
    const newUserId = location.split("/").pop();
    if (!newUserId) throw new Error("Invalid Location header");
    userId = newUserId;
  } catch (e) {
    if (e instanceof Error && e.message.includes("409")) {
      const [existing] = await adminFetch<KeycloakUser[]>(
        accessToken,
        `/users?email=${encodeURIComponent(email)}&exact=true`,
      );
      if (!existing) throw new Error(`User conflict but not found: ${email}`);
      userId = existing.id;
      isNewUser = false;
    } else {
      throw e;
    }
  }

  await adminMutate(accessToken, "PUT", `/users/${userId}/groups/${group.id}`);

  if (isNewUser) {
    await adminMutate(accessToken, "PUT", `/users/${userId}/execute-actions-email`, [
      "UPDATE_PASSWORD",
    ]);
  }
}
