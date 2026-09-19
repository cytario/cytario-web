import { type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";

import type { RouteAction, RouteLoader, ServerEndpointAuth } from "@cytario/plugin-api";
import { authContext, authMiddleware } from "~/.server/auth/authMiddleware";
import {
  hostRequestDataFromJobToken,
  orgAgnosticHostRequestData,
  readSoleOrganizationClaim,
} from "~/.server/auth/carveOutRequestContext";
import { verifyCarveOutSecret } from "~/.server/auth/carveOutSecret";
import { toIdentity } from "~/.server/auth/getUserInfo";
import { sessionMiddleware } from "~/.server/auth/sessionMiddleware";
import { verifyJobToken } from "~/.server/auth/verifyJobToken";
import { withHostRequestContext } from "~/.server/hostRequestContext";
import { jsonError } from "~/.server/httpResponse";
import { serverEndpointRegistry } from "~/.server/serverEndpointRegistry";

/**
 * Plugin-contributed server-endpoint dispatch. Plugins register endpoints
 * under `/api/plugin/*` via `ctx.serverEndpoints` during bootstrap; this splat
 * resource route matches the incoming pathname against
 * `serverEndpointRegistry.list()` and delegates to the contribution's
 * `loader` (GET/HEAD) or `action` (mutations).
 *
 * Auth split:
 * - `"session"` endpoints run inside the host's `authMiddleware` (gate,
 *   token-refresh, active-org check), so `identity` is resolved when plugin
 *   code runs.
 * - `"deployment-secret"` / `"webhook-secret"` carve-outs run outside the
 *   session gate with an org-agnostic `HostRequestData` (after a
 *   constant-time bearer-secret verification) so a cross-org reconciler can
 *   run.
 * - `"job-token"` carve-outs run outside the session gate: the host verifies
 *   the bearer token's signature, issuer, and audience and builds a
 *   `HostRequestData` from the verified claims. A token that fails
 *   verification returns 401; a token with multiple or no org keys is
 *   likewise rejected (no unambiguous active org).
 *
 * `sessionMiddleware` runs as route middleware so a session-auth dispatch
 * can read the resolved session without re-running the session loader; it
 * does not gate carve-outs.
 *
 * Unmatched paths return 404 JSON so this splat does not shadow the `*`
 * fallback's 200-HTML behaviour.
 */
export const middleware = [sessionMiddleware];

const isMutation = (method: string): boolean => method !== "GET" && method !== "HEAD";

function findEndpoint(pathname: string) {
  return serverEndpointRegistry.list().find((entry) => entry.contribution.path === pathname);
}

const notFound = () => jsonError(404, "Not Found");

async function dispatchSession(
  args: LoaderFunctionArgs | ActionFunctionArgs,
  contribution: { loader?: RouteLoader; action?: RouteAction },
  params: Record<string, string | undefined>,
): Promise<Response> {
  // `authMiddleware` is typed as `MiddlewareFunction` (Result defaults to
  // unknown); runtime always yields a Response — redirect, gate deny,
  // logout, or the plugin handler's return.
  const result = (await authMiddleware(args, async () => {
    const { user } = args.context.get(authContext);
    const identity = toIdentity(user);
    const handler = isMutation(args.request.method) ? contribution.action : contribution.loader;
    if (!handler) return notFound();
    return handler({ request: args.request, params, identity });
  })) as Response;
  return result;
}

function readBearerToken(request: Request): string | null {
  const header = request.headers.get("Authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1].trim() : null;
}

async function dispatchCarveOut(
  args: LoaderFunctionArgs | ActionFunctionArgs,
  contribution: { auth: ServerEndpointAuth; loader?: RouteLoader; action?: RouteAction },
  params: Record<string, string | undefined>,
): Promise<Response> {
  const handler = isMutation(args.request.method) ? contribution.action : contribution.loader;
  if (!handler) return notFound();

  if (contribution.auth === "job-token") {
    const rawToken = readBearerToken(args.request);
    if (!rawToken) return jsonError(401, "A job-scoped bearer token is required.");
    const verified = await verifyJobToken(rawToken);
    if (!verified) return jsonError(401, "The job-scoped token failed verification.");
    const organization = readSoleOrganizationClaim(verified);
    if (!organization) {
      return jsonError(403, "The job-scoped token has no single organization claim.");
    }
    const requestData = hostRequestDataFromJobToken(verified, rawToken, organization);
    return withHostRequestContext(requestData, () =>
      handler({ request: args.request, params, identity: requestData.identity }),
    );
  }

  // Constant-time bearer-secret check first — these dispatch org-agnostic,
  // so the secret is the only gate.
  if (!verifyCarveOutSecret(args.request, contribution.auth)) {
    return jsonError(401, "The shared secret failed verification.");
  }

  // Org-agnostic context so the reconciler's cross-org scan can run.
  const requestData = orgAgnosticHostRequestData();
  return withHostRequestContext(requestData, () =>
    handler({ request: args.request, params, identity: undefined }),
  );
}

export async function loader(args: LoaderFunctionArgs): Promise<Response> {
  const pathname = new URL(args.request.url).pathname;
  const entry = findEndpoint(pathname);
  if (!entry) return notFound();
  const { contribution } = entry;
  const params: Record<string, string | undefined> = args.params;
  return contribution.auth === "session"
    ? dispatchSession(args, contribution, params)
    : dispatchCarveOut(args, contribution, params);
}

export async function action(args: ActionFunctionArgs): Promise<Response> {
  const pathname = new URL(args.request.url).pathname;
  const entry = findEndpoint(pathname);
  if (!entry) return notFound();
  const { contribution } = entry;
  const params: Record<string, string | undefined> = args.params;
  return contribution.auth === "session"
    ? dispatchSession(args, contribution, params)
    : dispatchCarveOut(args, contribution, params);
}
