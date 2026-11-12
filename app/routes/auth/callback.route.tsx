import { LoaderFunctionArgs, redirect } from "react-router";

import { exchangeAuthCode } from "~/.server/auth/exchangeAuthCode";
import { getSession } from "~/.server/auth/getSession";
import { profileFromAccessToken, resolveActiveOrganization } from "~/.server/auth/getUserInfo";
import { validateOAuthState, validateRedirectTo } from "~/.server/auth/oauthState";
import { getPreferredOrg } from "~/.server/auth/orgPreference.server";
import { applyPendingGroupAssignments } from "~/.server/auth/pendingGroupAssignments";
import { sessionStorage } from "~/.server/auth/sessionStorage";
import { verifyIdToken } from "~/.server/auth/verifyIdToken";
import { createLabel } from "~/.server/logging";
import { cytarioConfig } from "~/config";
import { type NotificationInput } from "~/utils/notifications";
import { orgPath } from "~/utils/orgPath";

const label = createLabel("auth-callback", "cyan");

const failWithNotification = async (request: Request, message: string) => {
  const session = await getSession(request);
  session.set("notification", { status: "error" as const, message });
  return redirect("/login", {
    headers: { "Set-Cookie": await sessionStorage.commitSession(session) },
  });
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  console.info(`${label} Callback received`);

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");

  if (error) {
    // A silent re-auth (prompt=none) has no usable SSO session — this is an
    // expected outcome, not a failure. Fall back to interactive login,
    // recovering the return path from the (one-shot) state.
    if (error === "login_required" || error === "interaction_required") {
      const redirectTo = validateRedirectTo(
        state ? (await validateOAuthState(state))?.redirectTo : undefined,
      );
      console.info(`${label} Silent re-auth not possible (${error}), redirecting to login`);
      return redirect(`/login?redirect=${encodeURIComponent(redirectTo)}`);
    }

    console.error(`${label} Authorization error:`, error, errorDescription);
    return failWithNotification(
      request,
      errorDescription || "Authentication failed. Please try again.",
    );
  }

  if (!code || !state) {
    console.error(`${label} Missing code or state parameter`);
    return failWithNotification(request, "Authentication failed. Missing required parameters.");
  }

  try {
    // Atomic GETDEL: one-shot state consumption prevents CSRF replay.
    const stateData = await validateOAuthState(state);
    if (!stateData) {
      console.error(`${label} Invalid or expired state parameter`);
      return failWithNotification(request, "Authentication session expired. Please try again.");
    }

    // Guard for in-flight states from before PKCE deployment
    if (!stateData.codeVerifier || !stateData.nonce) {
      console.error(`${label} State missing codeVerifier or nonce`);
      return failWithNotification(request, "Authentication session invalid. Please try again.");
    }

    console.info(`${label} State validated successfully`);

    const redirectUri = `${cytarioConfig.endpoints.webapp}/auth/callback`;

    console.info(`${label} Exchanging authorization code for tokens`);
    const tokens = await exchangeAuthCode(code, redirectUri, stateData.codeVerifier);

    const idTokenPayload = await verifyIdToken(tokens.id_token);
    if (!idTokenPayload) {
      console.error(`${label} ID token signature verification failed`);
      return failWithNotification(request, "Authentication failed. Please try again.");
    }

    if (idTokenPayload.nonce !== stateData.nonce) {
      console.error(`${label} Nonce mismatch in ID token`);
      return failWithNotification(request, "Authentication failed. Please try again.");
    }

    const session = await getSession(request);

    // Derived from the access token issued in this auth-code response —
    // the refresh path's claim source, no userinfo round-trip.
    const user = profileFromAccessToken(tokens.access_token);
    if (!user) {
      return failWithNotification(request, "Authentication failed. Please try again.");
    }

    const notification: NotificationInput = {
      status: "success",
      message: `Welcome, ${user.email}!`,
    };

    session.set("user", user);
    session.set("authTokens", {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      idToken: tokens.id_token,
    });
    session.set("notification", notification);

    // The default org for the landing redirect: the persisted preference,
    // validated against the token's memberships, else the first alias.
    // Nothing org-flavored is stored on the session; the last-used-org
    // preference follows the org a later document navigation actually uses.
    const userSub = idTokenPayload.sub;
    const preferredOrg =
      typeof userSub === "string"
        ? await getPreferredOrg(userSub).catch((error: unknown) => {
            console.warn(`${label} Org preference lookup failed:`, error);
            return null;
          })
        : null;
    const defaultOrganization = resolveActiveOrganization(
      user.organizations,
      preferredOrg ?? undefined,
    );

    // Un-prefixed targets land in the default org rather than the 404 fallback.
    const redirectTo =
      defaultOrganization && validateRedirectTo(stateData.redirectTo) === "/"
        ? orgPath(defaultOrganization, "/")
        : validateRedirectTo(stateData.redirectTo);
    console.info(`${label} Authentication successful, redirecting to:`, redirectTo);

    // Group memberships recorded at invite time are applied here, after the
    // session is complete — the invitee's first login lands them in their
    // designated groups. The token minted during this login predates the
    // membership, so when anything was applied the silent re-auth re-runs the
    // group mappers before the user reaches their target. Rows are
    // tenant-scoped and the profile carries every membership, so each member
    // org is applied in turn; a failure in one org does not block the rest.
    let appliedGroups = false;
    for (const organization of Object.keys(user.organizations)) {
      try {
        if (await applyPendingGroupAssignments(user, organization)) {
          appliedGroups = true;
        }
      } catch (error) {
        console.error(
          `${label} Pending group assignment application failed for ${organization}:`,
          error,
        );
      }
    }
    if (appliedGroups) {
      console.info(`${label} Pending group assignments applied, refreshing session`);
      return redirect(`/auth/refresh?return_to=${encodeURIComponent(redirectTo)}`, {
        headers: { "Set-Cookie": await sessionStorage.commitSession(session) },
      });
    }

    return redirect(redirectTo, {
      headers: { "Set-Cookie": await sessionStorage.commitSession(session) },
    });
  } catch (error) {
    console.error(`${label} Authentication failed:`, error);
    return failWithNotification(request, "Authentication failed. Please try again.");
  }
};

export default function CallbackRoute() {
  return null;
}
