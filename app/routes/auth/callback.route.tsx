import { LoaderFunctionArgs, redirect } from "react-router";

import { readActiveOrgHint, resolveLoginActiveOrg } from "~/.server/auth/activeOrgHint";
import { exchangeAuthCode } from "~/.server/auth/exchangeAuthCode";
import { getSession } from "~/.server/auth/getSession";
import { profileFromAccessToken } from "~/.server/auth/getUserInfo";
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

    // The default org for the landing redirect: the cross-app hint, else the
    // persisted preference, membership-validated, else the first alias.
    const userSub = idTokenPayload.sub;
    const persistedOrg =
      typeof userSub === "string"
        ? await getPreferredOrg(userSub).catch((error: unknown) => {
            console.warn(`${label} Org preference lookup failed:`, error);
            return null;
          })
        : null;
    const hintedOrg = await readActiveOrgHint(request.headers.get("cookie"));
    const defaultOrganization = await resolveLoginActiveOrg(
      hintedOrg,
      user.organizations,
      persistedOrg,
    );

    // Un-prefixed targets land in the default org rather than the 404 fallback.
    const redirectTo =
      defaultOrganization && validateRedirectTo(stateData.redirectTo) === "/"
        ? orgPath(defaultOrganization, "/")
        : validateRedirectTo(stateData.redirectTo);
    console.info(`${label} Authentication successful, redirecting to:`, redirectTo);

    // This login's token predates any membership added here, so a silent
    // re-auth picks up the new group claims.
    let appliedGroups = false;
    try {
      appliedGroups = await applyPendingGroupAssignments(user, Object.keys(user.organizations));
    } catch (error) {
      console.error(`${label} Pending group assignment application failed:`, error);
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
