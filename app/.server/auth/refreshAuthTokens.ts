import { AuthTokens } from "./sessionStorage";
import { getWellKnownEndpoints } from "./wellKnownEndpoints";
import { cytarioConfig } from "~/config";

export interface AuthTokensResponse {
  access_token: string;
  expires_in: number;
  refresh_token: string;
  refresh_expires_in: number;
  id_token: string;
  token_type: "Bearer";
  scope: string;
}

/**
 * Refreshes the access token using the provided refresh token.
 */
export async function refreshAccessToken(
  refreshToken: string
): Promise<AuthTokens> {
  const wellKnownEndpoints = await getWellKnownEndpoints();

  const response = await fetch(wellKnownEndpoints.token_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: cytarioConfig.auth.clientId,
      client_secret: cytarioConfig.auth.clientSecret,
      refresh_token: refreshToken,
    }),
  });
  if (!response.ok) throw new Error("Failed to refresh token");
  const { access_token, id_token, refresh_token } =
    (await response.json()) as AuthTokensResponse;

  const authTokens: AuthTokens = {
    accessToken: access_token,
    idToken: id_token,
    refreshToken: refresh_token,
  };

  return authTokens;
}
