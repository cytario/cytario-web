import type { RouteAction, RouteLoader } from "./routes";

/**
 * Authentication mode for a server-only endpoint. The host restricts each
 * carve-out to its expected caller at the network layer:
 *
 * - `"session"` — authenticated by the session cookie; `authMiddleware` and
 *   the active-organization gate run before the endpoint.
 * - `"job-token"` — authenticated by a job-carried token (credential-broker
 *   endpoint); runs outside the session gate.
 * - `"webhook-secret"` — authenticated by a shared webhook secret
 *   (catalog-cache webhook); runs outside the session gate.
 * - `"deployment-secret"` — authenticated by a deployment secret compared in
 *   constant time (job-reconciliation endpoint); runs outside the session gate.
 *
 * The carve-outs are the only plugin-contributed routes that run outside the
 * session gate and are therefore first-class, host-reviewed extension
 * points, not opaque plugin internals.
 */
export type ServerEndpointAuth = "session" | "job-token" | "webhook-secret" | "deployment-secret";

/**
 * The org relationship of a server endpoint.
 *
 * - `"org"` — the endpoint acts in one organization: it is served under
 *   `/api/v1/{org}/…` and, for `"session"` auth, runs with the request-org
 *   identity (the org the caller's URL names, membership-validated by the
 *   host). The default.
 * - `"org-agnostic"` — the endpoint has no single-org caller: served under
 *   `/api/plugin/…`. Only valid for the carve-out auth modes (job-token,
 *   webhook-secret, deployment-secret), which are org-agnostic by
 *   construction; a `"session"` endpoint marked org-agnostic is rejected at
 *   registration (a session always has an org to act in).
 */
export type ServerEndpointScope = "org" | "org-agnostic";

/**
 * A single server-endpoint contribution from a plugin. Server-only: the host
 * wires `ctx.serverEndpoints` into `PluginContext` only when
 * `ctx.env === "server"`; on the client entry the registry is a no-op sink
 * whose `register` is `() => {}`.
 *
 * `path` is PLUGIN-RELATIVE (`/status`, `/catalog/run`): the host composes the
 * full URL from the declared scope — `/api/v1/{org}` + path for org-scoped
 * endpoints, `/api/plugin` + path for org-agnostic ones — so a plugin can
 * never accidentally shadow a core route or a foreign tenant's namespace.
 */
export interface ServerEndpointContribution {
  path: string;
  auth: ServerEndpointAuth;
  /** Default `"org"` — the endpoint acts in one organization. */
  scope?: ServerEndpointScope;
  loader?: RouteLoader;
  action?: RouteAction;
}

/**
 * Registry contract. The registry *implementation* lives in the host.
 *
 * Server-only: the host wires `ctx.serverEndpoints` into `PluginContext`
 * only when `ctx.env === "server"`; on the client entry the registry is a
 * no-op sink whose `register` is `() => {}`, so a single plugin module can
 * call `ctx.serverEndpoints.register(...)` unconditionally and the call
 * takes effect in the server realm only.
 */
export interface ServerEndpointRegistry {
  register(contribution: ServerEndpointContribution): void;
}
