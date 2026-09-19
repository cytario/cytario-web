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
 * A single server-endpoint contribution from a plugin. Server-only: the host
 * wires `ctx.serverEndpoints` into `PluginContext` only when
 * `ctx.env === "server"`; on the client entry the registry is a no-op sink
 * whose `register` is `() => {}`.
 */
export interface ServerEndpointContribution {
  path: string;
  auth: ServerEndpointAuth;
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
