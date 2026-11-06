import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";

import { authContext, authMiddleware } from "~/.server/auth/authMiddleware";
import { exchangeAuthCodeForJobGrant } from "~/.server/auth/exchangeAuthCodeForJobGrant";
import { decodeJwtClaims, profileFromTokenClaims, toIdentity } from "~/.server/auth/getUserInfo";
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

  // The acting org is the org the user submitted from, recorded at initiation —
  // not this request's URL. The callback is un-prefixed (the Keycloak job-broker
  // client registers exactly one redirect URI, the un-prefixed one), so the
  // middleware resolved the session's default org here, which for a
  // multi-membership session can be another org's alias.
  const organization = pending.organization;
  // The jobs view lives under the organization prefix.
  const jobsPath = (search = "") => `${orgPath(organization, JOBS_PATH)}${search}`;

  const redirectUri = `${url.origin}/api/job-grant/callback`;

  let grant;
  try {
    grant = await exchangeAuthCodeForJobGrant(code, redirectUri, pending.codeVerifier);
  } catch (err) {
    const message = err instanceof Error ? err.message : "exchange failed";
    console.error(`${label} Auth code exchange failed:`, message);
    return redirect(jobsPath("?error=grant_failed"));
  }

  // authMiddleware (in the middleware array) has already refreshed the
  // session tokens and populated authContext — read from there instead of
  // calling getSession again.
  const { authTokens, user: sessionUser } = context.get(authContext);
  if (!authTokens) {
    console.error(`${label} No auth tokens in session`);
    return redirect(jobsPath("?error=no_session"));
  }
  // Re-read the claims so a group change made since login is visible.
  // toIdentity derives the ACTING org's entitlements from the membership map
  // (submit-phase grant resolution is group-scoped and must see this org's
  // groups, not the session default's). Token-derived — the same claim set
  // the refresh path re-derives from.
  const userProfile =
    profileFromTokenClaims(decodeJwtClaims(authTokens.accessToken)) ?? sessionUser;
  const identity = toIdentity(userProfile, organization);

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
    organization,
    identity,
    authTokens,
    sessionId: context.get(sessionContext)?.id ?? "",
    jobGrant: { expiresAt: grant.expiresAt, offlineSessionId: grant.offlineSessionId },
  };

  return withHostRequestContext(requestData, async () => {
    try {
      const endpoint = serverEndpointRegistry.findOrgScoped(pending.pluginPath);

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
      return redirect(orgPath(organization, pending.returnPath));
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
