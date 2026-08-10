import { RouteRegistryImpl } from "~/lib/routeRegistryBase";

/**
 * Server-only route registry singleton. Records plugin-contributed
 * `loader`/`action` contributions under `/plugin/*` (SDS-CY-010093). Lives under
 * a `.server` path so it never enters the client bundle; the host's
 * `/plugin/*` splat dispatch reads this instance on the server.
 *
 * The client realm owns its own instance (`app/lib/clientRouteRegistry.ts`)
 * that records `element` contributions; a plugin env-branches which fields it
 * registers, so the two instances never hold conflicting copies of the same
 * contribution.
 */
export const routeRegistry = new RouteRegistryImpl();

export type { RouteRegistryImpl } from "~/lib/routeRegistryBase";
