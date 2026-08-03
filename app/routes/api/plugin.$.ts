import { type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";

import type { RouteAction, RouteLoader } from "@cytario/plugin-api";
import { authContext, authMiddleware } from "~/.server/auth/authMiddleware";
import { toIdentity } from "~/.server/auth/getUserInfo";
import { sessionMiddleware } from "~/.server/auth/sessionMiddleware";
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
 * - `"job-token"` / `"webhook-secret"` / `"deployment-secret"` carve-outs run
 *   outside the session gate (SDS-CY-010095): the plugin performs its own
 *   constant-time secret / job-token validation and receives `identity:
 *   undefined`.
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

async function dispatchCarveOut(
  args: LoaderFunctionArgs | ActionFunctionArgs,
  contribution: { loader?: RouteLoader; action?: RouteAction },
  params: Record<string, string | undefined>,
): Promise<Response> {
  // Outside the session gate (SDS-CY-010095): the plugin validates its own
  // token/secret. identity is undefined — the plugin derives the caller.
  const handler = isMutation(args.request.method) ? contribution.action : contribution.loader;
  if (!handler) return notFound();
  return handler({ request: args.request, params, identity: undefined });
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
