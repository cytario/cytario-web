import { getAdminToken } from "./serviceAccountToken";
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

export class KeycloakAdminError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "KeycloakAdminError";
  }
}

const adminApiBaseUrl = cytarioConfig.auth.baseUrl.replace("/realms/", "/admin/realms/");

async function adminRequest(
  method: string,
  path: string,
  init: { body?: BodyInit; contentType?: string } = {},
): Promise<Response> {
  const accessToken = await getAdminToken();

  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
  };
  if (init.contentType) headers["Content-Type"] = init.contentType;

  const response = await fetch(`${adminApiBaseUrl}${path}`, {
    method,
    headers,
    body: init.body,
  });

  if (!response.ok) {
    throw new KeycloakAdminError(
      response.status,
      `Keycloak Admin API ${method} ${path} failed: ${response.status} ${response.statusText}`,
    );
  }

  return response;
}

export async function adminFetch<T>(path: string): Promise<T> {
  const response = await adminRequest("GET", path);
  return response.json();
}

export async function adminMutate(
  method: "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
): Promise<Response> {
  if (body === undefined) {
    return adminRequest(method, path);
  }
  return adminRequest(method, path, {
    body: JSON.stringify(body),
    contentType: "application/json",
  });
}

/** Form-encoded request — required by Keycloak endpoints that consume URL-encoded bodies. */
export async function adminFormMutate(
  method: "POST" | "PUT",
  path: string,
  body: URLSearchParams,
): Promise<Response> {
  return adminRequest(method, path, {
    body: body.toString(),
    contentType: "application/x-www-form-urlencoded",
  });
}

/**
 * Iterate every page of a Keycloak list endpoint that uses `first` + `max`
 * cursors. KC defaults are often small (10), so callers should not rely on a
 * single fetch returning the full collection.
 *
 * `buildPath` receives a `URLSearchParams` already populated with `first` and
 * `max` — callers may attach extra params (e.g. `search`) before serialising
 * — and must return the absolute admin path to fetch.
 */
export async function adminFetchAll<T>(
  buildPath: (params: URLSearchParams) => string,
  options: { pageSize?: number } = {},
): Promise<T[]> {
  const pageSize = options.pageSize ?? 100;
  const out: T[] = [];
  let first = 0;
  while (true) {
    const params = new URLSearchParams({
      first: String(first),
      max: String(pageSize),
    });
    const page = await adminFetch<T[]>(buildPath(params));
    out.push(...page);
    if (page.length < pageSize) break;
    first += pageSize;
  }
  return out;
}
