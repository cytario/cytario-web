import { type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";

import type { RouteAction, RouteLoader, ServerEndpointAuth } from "@cytario/plugin-api";
import { authContext, authMiddleware } from "~/.server/auth/authMiddleware";
import {
  hostRequestDataFromJobToken,
  orgAgnosticHostRequestData,
} from "~/.server/auth/carveOutRequestContext";
import { toIdentity } from "~/.server/auth/getUserInfo";
import { sessionMiddleware } from "~/.server/auth/sessionMiddleware";
import { verifyJobToken } from "~/.server/auth/verifyJobToken";
import { withHostRequestContext } from "~/.server/hostRequestContext";
import { serverEndpointRegistry } from "~/.server/serverEndpointRegistry";

/**
 * Plugin-contributed server-endpoint dispatch (SDS-CY-010094/010095).
 *
 * Plugins register endpoints under `/api/plugin/*` via `ctx.serverEndpoints`
 * during bootstrap; this splat resource route matches the incoming pathname
 * against `serverEndpointRegistry.list()` and delegates to the contribution's
 * `loader` (GET/HEAD) or `action` (mutations).
 *
 * Auth split:
 * - `"session"` endpoints run inside the host's `authMiddleware` (gate +
 *   token-refresh + active-org check, SDS-CY-010094), so `identity` is
 *   resolved when plugin code runs.
 * - `"job-token"` carve-outs run outside the session gate (SDS-CY-010095):
 *   the host verifies the bearer token's signature, issuer, and audience
 *   (SRS-CY-416102(a), SRS-CY-41901) and builds a `HostRequestData` from the
 *   verified claims so host capabilities (`jobLedger`, `assumeComputeRole`)
 *   resolve org/owner from the token, not a session (SRS-CY-416102(b),
 *   SDS-CY-080400). A token that fails verification returns 401.
 * - `"deployment-secret"` / `"webhook-secret"` carve-outs run outside the
 *   session gate with an org-agnostic `HostRequestData` so a cross-org
 *   reconciler (`JobLedger.listAll`, SRS-CY-416106) can run. The constant-time
 *   secret compare is a separate host obligation (SDS-CY-010095).
 *
 * `sessionMiddleware` runs as route middleware so a session-auth dispatch can
 * read the resolved session without re-running the session loader; it does
 * not gate carve-outs (they ignore the session).
 *
 * Unmatched `/api/plugin/*` paths return 404 JSON so this splat does not shadow
 * the `*` fallback's 200-HTML behaviour.
 */
export const middleware = [sessionMiddleware];

const isMutation = (method: string): boolean => method !== "GET" && method !== "HEAD";

function findEndpoint(pathname: string) {
  return serverEndpointRegistry.list().find((entry) => entry.contribution.path === pathname);
}

const notFound = () =>
  Response.json(
    { error: "Not Found" },
    { status: 404, headers: { "Content-Type": "application/json" } },
  );

const deny = (status: number, message: string) =>
  Response.json({ error: message }, { status, headers: { "Content-Type": "application/json" } });

async function dispatchSession(
  args: LoaderFunctionArgs | ActionFunctionArgs,
  contribution: { loader?: RouteLoader; action?: RouteAction },
  params: Record<string, string | undefined>,
): Promise<Response> {
  // Reuse the host's authMiddleware exactly: gate, token-refresh, active-org
  // check. `next` runs the plugin loader/action with the resolved identity.
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

/**
 * Extracts the bearer token from the `Authorization` header (RFC 6750),
 * returning `null` when absent or malformed.
 */
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
    if (!rawToken) return deny(401, "A job-scoped bearer token is required.");
    const verified = await verifyJobToken(rawToken);
    if (!verified) return deny(401, "The job-scoped token failed verification.");
    const requestData = hostRequestDataFromJobToken(verified, rawToken);
    return withHostRequestContext(requestData, () =>
      handler({ request: args.request, params, identity: requestData.identity }),
    );
  }

  // deployment-secret / webhook-secret: org-agnostic context so the
  // reconciler's cross-org scan can run. The secret comparison itself is a
  // separate host obligation (SDS-CY-010095) — not implemented here.
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
