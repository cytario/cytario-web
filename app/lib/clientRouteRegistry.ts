import { RouteRegistryImpl } from "~/lib/routeRegistryBase";

// Client-only twin of the server singleton (app/.server/routeRegistry.ts):
// a plugin env-branches which fields it registers, so the two instances never
// hold conflicting copies of the same contribution; a plugin's single
// ctx.routes.register(...) lands in the realm that owns it.
export const clientRouteRegistry = new RouteRegistryImpl();
