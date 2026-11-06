import { type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";

import type { RouteAction, RouteLoader, ServerEndpointAuth } from "@cytario/plugin-api";
import { authContext, authMiddleware } from "~/.server/auth/authMiddleware";
import {
  orgAgnosticHostRequestData,
  jobTokenHostRequestData,
} from "~/.server/auth/carveOutRequestContext";
import { verifyCarveOutSecret } from "~/.server/auth/carveOutSecret";
import { toIdentity } from "~/.server/auth/getUserInfo";
import { resolveJobBinding } from "~/.server/auth/resolveJobBinding";
import { sessionMiddleware } from "~/.server/auth/sessionMiddleware";
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
 * - `"job-token"` carve-outs run outside the session gate: the host resolves
 *   the bearer token to the ledger row it was issued for and builds a
 *   `HostRequestData` from that row — the token's authority is the row, and no
 *   claim or caller-supplied field takes part. A token that resolves to no row
 *   returns 401.
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

/** The plugin-relative remainder under `/api/plugin` (org-agnostic carve-outs). */
function relativeUnderCarveOutPrefix(pathname: string): string {
  return pathname.slice("/api/plugin".length) || "/";
}

/** The plugin-relative remainder under `/api/v1/{org}/plugin`. */
function relativeUnderOrgPrefix(pathname: string): string {
  const withoutVersion = pathname.replace(/^\/api\/v1\/[^/]+/, "");
  return withoutVersion.slice("/plugin".length) || "/";
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
    const { user, requestOrganization } = args.context.get(authContext);
    const identity = toIdentity(user, requestOrganization);
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
    const binding = await resolveJobBinding(rawToken);
    if (!binding) {
      return jsonError(401, "The job-scoped token resolves to no active job.");
    }
    const requestData = jobTokenHostRequestData(binding);
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
  const { entry, params } = resolve(args);
  if (!entry) return notFound();
  const { contribution } = entry;
  return contribution.auth === "session"
    ? dispatchSession(args, contribution, params)
    : dispatchCarveOut(args, contribution, params);
}

export async function action(args: ActionFunctionArgs): Promise<Response> {
  const { entry, params } = resolve(args);
  if (!entry) return notFound();
  const { contribution } = entry;
  return contribution.auth === "session"
    ? dispatchSession(args, contribution, params)
    : dispatchCarveOut(args, contribution, params);
}

/**
 * Which registered endpoint this request addresses. The route is mounted at
 * TWO paths: `/api/v1/:org/plugin/*` (org-scoped — session endpoints, the
 * org validated by `authMiddleware` via the URL segment) and `/api/plugin/*`
 * (org-agnostic — carve-out endpoints whose callers carry no session). A
 * session contribution is only ever reachable through the org-prefixed mount,
 * and a carve-out only through the plain one.
 */
function resolve(args: LoaderFunctionArgs | ActionFunctionArgs) {
  const pathname = new URL(args.request.url).pathname;
  const orgScoped = /^\/api\/v1\/[^/]+\/plugin(\/|$)/.test(pathname);
  const relative = orgScoped
    ? relativeUnderOrgPrefix(pathname)
    : relativeUnderCarveOutPrefix(pathname);
  const entry = orgScoped
    ? serverEndpointRegistry.findOrgScoped(relative)
    : serverEndpointRegistry.findOrgAgnostic(relative);
  const params = { ...args.params, __pluginPath: relative };
  return { entry, params };
}
