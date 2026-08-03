import { hostRequestStorage } from "./hostRequestContext";
import { getProviderCatalog } from "./providers/providerCatalog.server";
import type { AppCatalog } from "~/utils/providerCatalog.schema";

function requireRequestData() {
  const data = hostRequestStorage.getStore();
  if (!data) {
    throw new Error(
      "Host capabilities called outside a request context — ensure the request pipeline sets up hostRequestStorage before plugin loaders/actions run",
    );
  }
  return data;
}

/**
 * Finds an app catalog by its display name (the `connectionName` a plugin
 * passes to `connectionFetch`). Returns `undefined` when no enabled,
 * connected catalog matches.
 */
function findCatalog(catalogs: AppCatalog[], connectionName: string): AppCatalog | undefined {
  return catalogs.find(
    (c) => c.displayName === connectionName && c.enabled && c.status === "connected",
  );
}

/**
 * Validates that the request URL's origin matches the catalog's
 * `registryEndpoint` origin. This is an SSRF guard — a plugin cannot
 * use `connectionFetch` to reach an arbitrary host; egress is confined to
 * the connection's registry origin (SDS-CY-010097, SRS-CY-39305/52207).
 */
function assertSameOrigin(registryEndpoint: string, requestUrl: string): void {
  const allowed = new URL(registryEndpoint);
  const actual = new URL(requestUrl);
  if (allowed.origin !== actual.origin) {
    throw new Error(
      `connectionFetch egress violation: request origin "${actual.origin}" does not match the catalog's registry origin "${allowed.origin}"`,
    );
  }
}

/**
 * Server-side `connectionFetch` implementation. Resolves the named catalog
 * connection from the provider catalog (the admin portal already decrypts
 * the robot secret and returns it in the lookup), attaches HTTP Basic auth
 * with the robot credentials, issues the request, and strips the
 * Authorization header from the response — so the plugin composes registry
 * requests but never receives or retains the credential (SDS-CY-010097).
 *
 * Egress is confined to the connection's `registryEndpoint` origin (SSRF
 * guard).
 */
export async function catalogFetch(
  connectionName: string,
  url: string,
  init?: RequestInit,
): Promise<Response> {
  const { user, authTokens } = requireRequestData();
  const catalog = await getProviderCatalog(user.organization!, authTokens.accessToken);

  const appCatalog = findCatalog(catalog.appCatalogs, connectionName);
  if (!appCatalog) {
    throw new Error(
      `No enabled, connected app catalog named "${connectionName}" found in the provider catalog`,
    );
  }

  assertSameOrigin(appCatalog.registryEndpoint, url);

  const authHeader = `Basic ${Buffer.from(
    `${appCatalog.accessAccountId}:${appCatalog.accessAccountSecret}`,
  ).toString("base64")}`;

  const response = await fetch(url, {
    ...init,
    headers: {
      ...init?.headers,
      Authorization: authHeader,
    },
  });

  const strippedHeaders = new Headers(response.headers);
  strippedHeaders.delete("Authorization");
  strippedHeaders.delete("authorization");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: strippedHeaders,
  });
}
