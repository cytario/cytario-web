import { RouteRegistryImpl } from "~/lib/routeRegistryBase";

/**
 * Client-only route registry singleton. Records plugin-contributed `element`
 * contributions under `/plugin/*` (SDS-CY-010093). The host's `/plugin/*`
 * splat route reads this instance in the browser to render the contributed
 * element (the host owns the render-site cast from `unknown` to `ComponentType`,
 * SDS-CY-010083).
 *
 * The server realm owns its own instance (`app/.server/routeRegistry.ts`)
 * that records `loader`/`action` contributions; a plugin env-branches which
 * fields it registers, so the two instances never hold conflicting copies of
 * the same contribution. `entry.client.tsx` passes this singleton to
 * `bootstrapPlugins` as `registries.routes`; `entry.server.tsx` passes the
 * server singleton. Both expose the same `RouteRegistry` interface, so a
 * plugin's single `ctx.routes.register(...)` call lands in the realm that
 * owns it (SDS-CY-010091).
 */
export const clientRouteRegistry = new RouteRegistryImpl();
