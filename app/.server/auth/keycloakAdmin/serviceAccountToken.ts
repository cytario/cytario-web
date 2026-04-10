import { cytarioConfig } from "~/config";

let cachedToken: string | null = null;
let tokenExpiresAt = 0;
let pendingRefresh: Promise<string> | null = null;

const EXPIRY_BUFFER_MS = 30_000;

/**
 * Returns a valid access token for the KC admin service account.
 * Uses the existing cytario-web client credentials with client_credentials grant.
 * Caches the token in memory and refreshes before expiry.
 * Concurrent callers share a single in-flight refresh to avoid stampeding the token endpoint.
 */
export async function getAdminToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiresAt - EXPIRY_BUFFER_MS) {
    return cachedToken;
  }

  if (pendingRefresh) {
    return pendingRefresh;
  }

  pendingRefresh = refreshToken();
  try {
    return await pendingRefresh;
  } finally {
    pendingRefresh = null;
  }
}

async function refreshToken(): Promise<string> {
  const { baseUrl, clientId, clientSecret } = cytarioConfig.auth;
  const tokenUrl = `${baseUrl}/protocol/openid-connect/token`;

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!response.ok) {
    cachedToken = null;
    tokenExpiresAt = 0;
    throw new Error(
      `Failed to obtain admin service account token: ${response.status} ${response.statusText}`,
    );
  }

  const data = await response.json();
  const token: string = data.access_token;
  cachedToken = token;
  tokenExpiresAt = Date.now() + data.expires_in * 1000;

  return token;
}
