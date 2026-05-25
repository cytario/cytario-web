import { adminFetch, adminMutate, type KeycloakUser } from "./client";

export async function getUser(userId: string): Promise<KeycloakUser> {
  return adminFetch<KeycloakUser>(`/users/${userId}`);
}

export async function updateUser(
  userId: string,
  data: { firstName: string; lastName: string; email: string; enabled: boolean },
): Promise<void> {
  await adminMutate("PUT", `/users/${userId}`, data);
}

export async function setUserEnabled(userId: string, enabled: boolean): Promise<void> {
  await adminMutate("PUT", `/users/${userId}`, { enabled });
}
