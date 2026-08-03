import { cytarioConfig } from "~/config";

interface CachedToken {
  token: string;
  expiresAt: number;
}

interface PendingRefresh {
  promise: Promise<string>;
}

const EXPIRY_BUFFER_MS = 30_000;

const cache = new Map<string, CachedToken>();
const pending = new Map<string, PendingRefresh>();

/**
 * Returns a valid access token for the cytario-web-admin service account
 * (client_credentials grant). Caches per clientId in memory and refreshes
 * before expiry. Concurrent callers for the same clientId share a single
 * in-flight refresh to avoid stampeding the token endpoint.
 *
 * Used by the keycloakAdmin client for user/group/organization management
 * operations — holds the broader realm-management role set (manage-users,
 * view-users, query-groups, manage-organizations, manage-identity-
 * providers).
 */
export async function getAdminToken(): Promise<string> {
  return getServiceAccountToken({
    clientId: cytarioConfig.auth.adminClientId,
    clientSecret: cytarioConfig.auth.adminClientSecret,
    cacheKey: "admin",
  });
}

/**
 * Returns a valid access token for the job-broker service account
 * (client_credentials grant). Narrow permission set — holds only
 * `manage-users` on realm-management, the narrowest standard role
 * covering the offline-session revocation endpoint
 * `DELETE /admin/realms/{realm}/sessions/{session}?isOffline=true`
 * (SDS-CY-020105, SDS-CY-080901). Used by the reconciler to revoke
 * terminal jobs' offline grants.
 */
export async function getJobBrokerToken(): Promise<string> {
  const { jobBrokerClientId, jobBrokerClientSecret } = cytarioConfig.auth;
  if (!jobBrokerClientId || !jobBrokerClientSecret) {
    throw new Error(
      "Job broker client is not configured — set KC_JOB_BROKER_CLIENT_ID and KC_JOB_BROKER_CLIENT_SECRET",
    );
  }
  return getServiceAccountToken({
    clientId: jobBrokerClientId,
    clientSecret: jobBrokerClientSecret,
    cacheKey: "job-broker",
  });
}

interface ServiceAccountCreds {
  clientId: string;
  clientSecret: string;
  cacheKey: string;
}

async function getServiceAccountToken(creds: ServiceAccountCreds): Promise<string> {
  const cached = cache.get(creds.cacheKey);
  if (cached && Date.now() < cached.expiresAt - EXPIRY_BUFFER_MS) {
    return cached.token;
  }

  const existing = pending.get(creds.cacheKey);
  if (existing) {
    return existing.promise;
  }

  const promise = refreshToken(creds);
  pending.set(creds.cacheKey, { promise });
  try {
    return await promise;
  } finally {
    pending.delete(creds.cacheKey);
  }
}

async function refreshToken(creds: ServiceAccountCreds): Promise<string> {
  const tokenUrl = `${cytarioConfig.auth.baseUrl}/protocol/openid-connect/token`;

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
    }),
  });

  if (!response.ok) {
    cache.delete(creds.cacheKey);
    throw new Error(
      `Failed to obtain ${creds.cacheKey} service account token: ${response.status} ${response.statusText}`,
    );
  }

  const data = await response.json();
  const token: string = data.access_token;
  cache.set(creds.cacheKey, {
    token,
    expiresAt: Date.now() + data.expires_in * 1000,
  });

  return token;
}
