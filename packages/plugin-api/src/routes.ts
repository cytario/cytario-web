import type { Identity } from "./auth";

/**
 * Arguments a plugin-contributed route loader receives. For a `session`-auth
 * endpoint the host's `authMiddleware` and the active-organization gate (§4.7)
 * run **before** the loader, so `identity` and the active organization are
 * resolved when plugin code runs (SDS-CY-010094); the `identity` projection is
 * the PII-free `Identity` of SDS-CY-010060/010061 — `organization?`,
 * `organizationAttributes`, `groups`, `adminScopes`, and no other field. For a
 * carve-out endpoint (job-token / webhook-secret / deployment-secret) the host
 * runs no session gate (SDS-CY-010095), so `identity` is `undefined` and the
 * plugin derives the caller from its own token/secret.
 */
export interface RouteLoaderArgs {
  request: Request;
  params: Record<string, string | undefined>;
  identity?: Identity;
}

export type RouteLoader = (args: RouteLoaderArgs) => Promise<Response> | Response;

/**
 * Arguments a plugin-contributed route action receives. Same identity and
 * ordering guarantees as `RouteLoaderArgs` (SDS-CY-010094). Plugin-contributed
 * write actions shall fail **closed** — explicitly opposite the fail-open
 * posture of the navigation gate (SDS-CY-010096).
 */
export interface RouteActionArgs {
  request: Request;
  params: Record<string, string | undefined>;
  identity?: Identity;
}

export type RouteAction = (args: RouteActionArgs) => Promise<Response> | Response;

/**
 * A single route contribution from a plugin. The `path` is validated against
 * the host's reserved-prefix allowlist so a plugin route cannot shadow a core
 * route; a collision is a bootstrap-contained registration error
 * (SDS-CY-010092). The `element` is typed opaquely at the package boundary
 * so `@cytario/plugin-api` stays framework-free; the host owns the render-site
 * cast to `ComponentType` (precedent SDS-CY-010083).
 *
 * The host merges contributions into its route tree at bootstrap with no
 * runtime dynamic-import (SDS-CY-010093, §7.7). Each realm's singleton
 * records only the fields that realm owns: the server singleton records
 * `loader`/`action`, the client singleton records `element`.
 */
export interface RouteContribution {
  path: string;
  /** Opaque React component — host casts to `ComponentType`. */
  element?: unknown;
  loader?: RouteLoader;
  action?: RouteAction;
}

/**
 * Registry contract. The registry *type* ships in `@cytario/plugin-api`; the
 * registry *implementation* and the route-tree merge live in the host
 * (`app/.server/routeRegistry.ts` server, `app/lib/clientRouteRegistry.ts`
 * client — both reuse `app/lib/routeRegistryBase.ts`).
 *
 * Server + client: the host wires `ctx.routes` into `PluginContext` in both
 * realms; each realm owns its own singleton instance. A plugin env-branches
 * which fields it registers (`loader`/`action` when `ctx.env === "server"`,
 * `element` when `ctx.env === "client"`) so a single plugin module can call
 * `ctx.routes.register(...)` unconditionally and the contribution lands in
 * the realm that owns it (SDS-CY-010091/010093).
 */
export interface RouteRegistry {
  register(contribution: RouteContribution): void;
}
