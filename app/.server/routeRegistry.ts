import { RouteRegistryImpl } from "~/lib/routeRegistryBase";

// Server-only route registry singleton; the client realm owns its own
// instance (app/lib/clientRouteRegistry.ts), so a plugin env-branches which
// fields it registers and the two never hold conflicting contributions.
export const routeRegistry = new RouteRegistryImpl();

export type { RouteRegistryImpl } from "~/lib/routeRegistryBase";
