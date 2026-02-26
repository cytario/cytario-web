import { cytarioConfig } from "~/config";

export interface KeycloakGroup {
  id: string;
  name: string;
  path: string;
  subGroups: KeycloakGroup[];
}

export interface KeycloakUser {
  id: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  enabled: boolean;
}

const adminApiBaseUrl = cytarioConfig.auth.baseUrl.replace(
  "/realms/",
  "/admin/realms/",
);

async function adminRequest(
  accessToken: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<Response> {
  const response = await fetch(`${adminApiBaseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    throw new Error(
      `Keycloak Admin API ${method} ${path} failed: ${response.status} ${response.statusText}`,
    );
  }

  return response;
}

export async function adminFetch<T>(
  accessToken: string,
  path: string,
): Promise<T> {
  const response = await adminRequest(accessToken, "GET", path);
  return response.json();
}

export async function adminMutate(
  accessToken: string,
  method: "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
): Promise<Response> {
  return adminRequest(accessToken, method, path, body);
}
