import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";

import { authContext, authMiddleware } from "~/.server/auth/authMiddleware";
import { exchangeAuthCodeForJobGrant } from "~/.server/auth/exchangeAuthCodeForJobGrant";
import { getUserInfo, toIdentity } from "~/.server/auth/getUserInfo";
import { consumePendingSubmission } from "~/.server/auth/jobGrantStorage";
import { sessionContext } from "~/.server/auth/sessionMiddleware";
import { withHostRequestContext } from "~/.server/hostRequestContext";
import { createLabel } from "~/.server/logging";
import { requestDurationMiddleware } from "~/.server/requestDurationMiddleware";
import { serverEndpointRegistry } from "~/.server/serverEndpointRegistry";

const label = createLabel("job-grant", "magenta");

export const middleware = [requestDurationMiddleware, authMiddleware];

/**
 * Authorization Code flow callback for the job-grant (SRS-CY-41901).
 *
 * Keycloak redirects here after the user consents to `offline_access`.
 * The callback:
 * 1. Validates the `state` parameter and retrieves the pending submission
 *    (and PKCE verifier) from Redis (single-use).
 * 2. Exchanges the auth code + PKCE verifier for the offline grant
 *    (refresh token + offline session id) on the job-broker client.
 * 3. Sets up a `HostRequestData` with the grant and invokes the plugin's
 *    submit phase by re-dispatching the original request to the plugin
 *    endpoint.
 * 4. Redirects the browser to the jobs view.
 *
 * The plugin's submit phase calls `ctx.host.exchangeToken()` which returns
 * the grant from the request context (no token exchange at runtime).
 */
export const loader = async (args: LoaderFunctionArgs) => {
  const { request, context } = args;
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    console.error(`${label} Authorization error:`, error);
    return redirect("/plugin/jobs?error=grant_denied");
  }

  if (!code || !state) {
    console.error(`${label} Missing code or state parameter`);
    return redirect("/plugin/jobs?error=grant_failed");
  }

  const pending = await consumePendingSubmission(state);
  if (!pending) {
    console.error(`${label} Invalid or expired state`);
    return redirect("/plugin/jobs?error=grant_expired");
  }

  const redirectUri = `${new URL(request.url).origin}/api/job-grant/callback`;

  let grant;
  try {
    grant = await exchangeAuthCodeForJobGrant(code, redirectUri, pending.codeVerifier);
  } catch (err) {
    const message = err instanceof Error ? err.message : "exchange failed";
    console.error(`${label} Auth code exchange failed:`, message);
    return redirect("/plugin/jobs?error=grant_failed");
  }

  // authMiddleware has already run (in the middleware array), refreshing
  // the session tokens and populating authContext with the fresh user +
  // authTokens. Read from there instead of manually calling getSession.
  const { authTokens } = context.get(authContext);
  if (!authTokens) {
    console.error(`${label} No auth tokens in session`);
    return redirect("/plugin/jobs?error=no_session");
  }
  const userProfile = await getUserInfo(authTokens.accessToken);
  const identity = toIdentity(userProfile);

  const requestData = {
    user: userProfile,
    identity,
    authTokens,
    sessionId: context.get(sessionContext)?.id ?? "",
    jobGrant: grant,
  };

  return withHostRequestContext(requestData, async () => {
    try {
      const endpoint = serverEndpointRegistry
        .list()
        .find((e) => e.contribution.path === pending.pluginPath);

      if (!endpoint || !endpoint.contribution.action) {
        throw new Error(`Plugin endpoint ${pending.pluginPath} not found or has no action`);
      }

      const rebuiltRequest = new Request(new URL(pending.pluginPath, request.url).toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Job-Grant-Phase": "submit",
          "X-Job-Grant-Batch-Id": pending.batchId,
        },
        body: pending.requestBody,
      });

      await endpoint.contribution.action({
        request: rebuiltRequest,
        params: {},
        identity,
      });

      console.info(`${label} Job submission completed for batch ${pending.batchId}`);
      return redirect(pending.returnPath);
    } catch (err) {
      const message = err instanceof Error ? err.message : "submission failed";
      console.error(`${label} Job submission failed:`, message);
      const params = new URLSearchParams({ error: "submit_failed" });
      if (err instanceof Error && err.message) params.set("message", err.message);
      return redirect(`/plugin/jobs?${params.toString()}`);
    }
  });
};
