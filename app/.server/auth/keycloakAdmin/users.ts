import { adminFetch, adminMutate, type KeycloakUser } from "./client";
import { findGroupByPath } from "./groups";

export async function updateUser(
  userId: string,
  data: { firstName: string; lastName: string; email: string; enabled: boolean },
): Promise<void> {
  await adminMutate("PUT", `/users/${userId}`, data);
}

export async function addUserToGroup(
  userId: string,
  groupId: string,
): Promise<void> {
  await adminMutate("PUT", `/users/${userId}/groups/${groupId}`);
}

export async function removeUserFromGroup(
  userId: string,
  groupId: string,
): Promise<void> {
  await adminMutate("DELETE", `/users/${userId}/groups/${groupId}`);
}

export async function setUserEnabled(
  userId: string,
  enabled: boolean,
): Promise<void> {
  await adminMutate("PUT", `/users/${userId}`, { enabled });
}

export async function inviteUser(
  email: string,
  firstName: string,
  lastName: string,
  groupPath: string,
  enabled: boolean,
): Promise<void> {
  const group = await findGroupByPath(groupPath);
  if (!group) throw new Error(`Group not found: ${groupPath}`);

  let userId: string;
  let isNewUser = true;
  try {
    const res = await adminMutate("POST", "/users", {
      username: email,
      email,
      firstName,
      lastName,
      enabled,
    });
    const location = res.headers.get("location");
    if (!location) throw new Error("Missing Location header");
    const newUserId = location.split("/").pop();
    if (!newUserId) throw new Error("Invalid Location header");
    userId = newUserId;
  } catch (e) {
    if (e instanceof Error && e.message.includes("409")) {
      const [existing] = await adminFetch<KeycloakUser[]>(
        `/users?email=${encodeURIComponent(email)}&exact=true`,
      );
      if (!existing) throw new Error(`User conflict but not found: ${email}`);
      userId = existing.id;
      isNewUser = false;
    } else {
      throw e;
    }
  }

  await adminMutate("PUT", `/users/${userId}/groups/${group.id}`);

  if (isNewUser) {
    await adminMutate("PUT", `/users/${userId}/execute-actions-email`, [
      "UPDATE_PASSWORD",
    ]);
  }
}
