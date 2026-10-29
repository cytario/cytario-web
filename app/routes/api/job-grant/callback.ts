import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";

import { authContext, authMiddleware } from "~/.server/auth/authMiddleware";
import { exchangeAuthCodeForJobGrant } from "~/.server/auth/exchangeAuthCodeForJobGrant";
import { getUserInfo, toIdentity } from "~/.server/auth/getUserInfo";
import {
  collectCredentialsIfBatchEmpty,
  putBatchCredentials,
} from "~/.server/auth/jobCredentialStore";
import { consumePendingSubmission } from "~/.server/auth/jobGrantStorage";
import { sessionContext } from "~/.server/auth/sessionMiddleware";
import { withHostRequestContext } from "~/.server/hostRequestContext";
import { createLabel } from "~/.server/logging";
import { requestDurationMiddleware } from "~/.server/requestDurationMiddleware";
import { serverEndpointRegistry } from "~/.server/serverEndpointRegistry";
import { orgPath } from "~/utils/orgPath";

const label = createLabel("job-grant", "magenta");

const JOBS_PATH = "/plugin/jobs";

export const middleware = [requestDurationMiddleware, authMiddleware];

/**
 * Authorization Code flow callback for the job grant. Keycloak redirects
 * here after the user consents to `offline_access`; the callback validates
 * the `state`, exchanges the auth code + PKCE verifier for the offline
 * grant on the job-broker client, sets up a `HostRequestData` with the
 * grant, and re-dispatches the original request to the plugin's submit
 * phase before redirecting to the jobs view.
 */
export const loader = async (args: LoaderFunctionArgs) => {
  const { request, context } = args;
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  // The jobs view lives under the URL's organization prefix; this callback is
  // an API route, so the session is the only source for which one.
  const jobsPath = (search = "") =>
    `${orgPath(context.get(authContext).activeOrganization, JOBS_PATH)}${search}`;

  if (error) {
    console.error(`${label} Authorization error:`, error);
    return redirect(jobsPath("?error=grant_denied"));
  }

  if (!code || !state) {
    console.error(`${label} Missing code or state parameter`);
    return redirect(jobsPath("?error=grant_failed"));
  }

  const pending = await consumePendingSubmission(state);
  if (!pending) {
    console.error(`${label} Invalid or expired state`);
    return redirect(jobsPath("?error=grant_expired"));
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

  // authMiddleware (in the middleware array) has already refreshed the
  // session tokens and populated authContext — read from there instead of
  // calling getSession again.
  const { authTokens, activeOrganization, user: sessionUser } = context.get(authContext);
  if (!authTokens) {
    console.error(`${label} No auth tokens in session`);
    return redirect(jobsPath("?error=no_session"));
  }
  // Re-read the claims so a group change made since login is visible, but stay
  // in the org the user is working in rather than re-picking one.
  const userProfile = await getUserInfo(
    authTokens.accessToken,
    activeOrganization ?? sessionUser?.organization,
  );
  const identity = toIdentity(userProfile);

  // The batch's OAuth material is written here — the one point where the
  // refresh token exists — and never reaches the plugin or a container.
  const { refreshToken, accessToken, accessTokenExpiresAt } = grant;
  if (!refreshToken || !accessToken || !accessTokenExpiresAt) {
    console.error(`${label} Auth code exchange returned no credential material`);
    return redirect(jobsPath("?error=grant_failed"));
  }

  try {
    await putBatchCredentials({
      batchId: pending.batchId,
      organization: pending.organization,
      offlineSessionId: grant.offlineSessionId,
      refreshToken,
      accessToken,
      accessTokenExpiresAt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "credential record failed";
    console.error(`${label} Failed to store batch credentials:`, message);
    return redirect(jobsPath("?error=submit_failed"));
  }

  const requestData = {
    user: userProfile,
    identity,
    authTokens,
    sessionId: context.get(sessionContext)?.id ?? "",
    jobGrant: { expiresAt: grant.expiresAt, offlineSessionId: grant.offlineSessionId },
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
      return redirect(orgPath(activeOrganization, pending.returnPath));
    } catch (err) {
      const message = err instanceof Error ? err.message : "submission failed";
      console.error(`${label} Job submission failed:`, message);
      // A total submission failure records no job, so nothing would ever collect
      // this batch's credentials through the ledger sweep. Drop them here; a
      // partial submission leaves the rows that did land, and the sweep
      // collects the record once those are gone.
      await collectCredentialsIfBatchEmpty(pending.batchId).catch((cleanupErr) => {
        console.warn(
          `${label} Failed to drop credentials for an unsubmitted batch: ${
            cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr)
          }`,
        );
      });
      const params = new URLSearchParams({ error: "submit_failed" });
      if (err instanceof Error && err.message) params.set("message", err.message);
      return redirect(jobsPath(`?${params.toString()}`));
    }
  });
};
