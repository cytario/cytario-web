import { cytarioConfig } from "~/config";

const { baseUrl } = cytarioConfig.auth;

interface WellKnownEndpoints {
  authorization_endpoint: string;
  token_endpoint: string;
  revocation_endpoint: string;
  end_session_endpoint: string;
  userinfo_endpoint: string;
}

let cachedEndpoints: WellKnownEndpoints | null = null;

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
    return data;
  } catch (error) {
    console.error(
      `Error fetching well-known endpoints from ${endpointUrl}:`,
      error,
    );
    cachedEndpoints = null;
    throw error;
  }
};

export const getWellKnownEndpoints = async (): Promise<WellKnownEndpoints> => {
  if (cachedEndpoints) return cachedEndpoints;
  return await fetchWellKnownEndpoints();
};
