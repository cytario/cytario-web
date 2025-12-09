import { AuthTokensResponse } from "./refreshAuthTokens";
import { getWellKnownEndpoints } from "./wellKnownEndpoints";
import { cytarioConfig } from "~/config";

const { clientId, clientSecret } = cytarioConfig.auth;

/**
 * Exchanges an authorization code for tokens using the OAuth 2.0 Authorization Code Flow.
 * This is the modern, recommended approach instead of the password grant (ROPC).
 */
export const exchangeAuthCode = async (
  code: string,
  redirectUri: string
): Promise<AuthTokensResponse> => {
  try {
    const wellKnownEndpoints = await getWellKnownEndpoints();
    const tokenResponse = await fetch(wellKnownEndpoints.token_endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(
          `${clientId}:${clientSecret}`
        ).toString("base64")}`,
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      throw new Error(
        `Token exchange failed: ${tokenResponse.status} - ${errorText}`
      );
    }

    const json = await tokenResponse.json();

    return json as AuthTokensResponse;
  } catch (error) {
    console.error("Authorization code exchange failed:", error);
    throw error;
  }
};
