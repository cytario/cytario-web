import { cytarioConfig } from "~/config";

const { baseUrl } = cytarioConfig.auth;

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

interface WellKnownEndpoints {
  authorization_endpoint: string;
  token_endpoint: string;
  revocation_endpoint: string;
  end_session_endpoint: string;
  userinfo_endpoint: string;
  jwks_uri: string;
  issuer: string;
}

let cachedEndpoints: WellKnownEndpoints | null = null;
let cacheExpiresAt = 0;

const fetchWellKnownEndpoints = async (): Promise<WellKnownEndpoints> => {
  const endpointUrl = `${baseUrl}/.well-known/openid-configuration`;
  try {
    const res = await fetch(endpointUrl);
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(
        `Failed to fetch well-known endpoints: ${res.status} ${res.statusText} - ${errorText}`,
      );
    }
    const data: WellKnownEndpoints = await res.json();
    cachedEndpoints = data;
    cacheExpiresAt = Date.now() + CACHE_TTL_MS;
    return data;
  } catch (error) {
    console.error(
      `Error fetching well-known endpoints from ${endpointUrl}:`,
      error,
    );
    cachedEndpoints = null;
    cacheExpiresAt = 0;
    throw error;
  }
};

export const getWellKnownEndpoints = async (): Promise<WellKnownEndpoints> => {
  if (cachedEndpoints && Date.now() < cacheExpiresAt) return cachedEndpoints;
  return await fetchWellKnownEndpoints();
};
