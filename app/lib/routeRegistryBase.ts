import type { RouteContribution, RouteRegistry } from "@cytario/plugin-api";

/**
 * Path prefixes a plugin may contribute routes under. A path that does not
 * start with one of these is rejected so a plugin route cannot shadow a core
 * route (SDS-CY-010093). Extend this list when new plugin route subtrees are
 * reserved.
 */
export const ROUTE_PREFIX_ALLOWLIST = ["/plugin"] as const;

export interface RouteRecord {
  pluginName: string;
  contribution: RouteContribution;
}

export function isPathAllowed(path: string): boolean {
  return ROUTE_PREFIX_ALLOWLIST.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

/**
 * Realm-agnostic `RouteRegistry` implementation. The validation and duplicate
 * detection are identical server-side and client-side; the two realms differ
 * only in *which* fields a plugin populates (`loader`/`action` server, `element`
 * client) and therefore which contributions each singleton actually receives.
 * Lives outside `.server/` so the client singleton can import it without
 * pulling server-only code into the client bundle.
 *
 * The registry validates contributed paths against the reserved-prefix
 * allowlist and detects duplicate path registrations within a single plugin.
 * Cross-plugin path collisions are also rejected — unlike UI registries
 * (context menus, sidebar nav) where cross-plugin `id` collisions are
 * tolerated, two plugins cannot own the same route path.
 *
 * Each realm owns its own instance: the server singleton
 * (`app/.server/routeRegistry.ts`) records loader/action contributions; the
 * client singleton (`app/lib/clientRouteRegistry.ts`) records element
 * contributions. A plugin env-branches which fields it registers, so the two
 * instances never hold conflicting copies of the same contribution.
 */
export class RouteRegistryImpl {
  protected readonly entries: RouteRecord[] = [];

  scopedFor(pluginName: string): RouteRegistry {
    return {
      register: (contribution) => this.add(pluginName, contribution),
    };
  }

  add(pluginName: string, contribution: RouteContribution): void {
    if (!contribution || typeof contribution !== "object") {
      throw new TypeError(`Plugin "${pluginName}" registered a non-object route contribution`);
    }
    if (typeof contribution.path !== "string" || contribution.path.length === 0) {
      throw new TypeError(`Plugin "${pluginName}" registered a route with a missing or empty path`);
    }
    if (!contribution.path.startsWith("/")) {
      throw new TypeError(
        `Plugin "${pluginName}" registered a route path "${contribution.path}" that does not start with "/"`,
      );
    }
    if (!isPathAllowed(contribution.path)) {
      throw new Error(
        `Plugin "${pluginName}" registered a route path "${contribution.path}" outside the reserved-prefix allowlist [${ROUTE_PREFIX_ALLOWLIST.join(", ")}]`,
      );
    }
    const dup = this.entries.find((r) => r.contribution.path === contribution.path);
    if (dup) {
      throw new Error(
        `Plugin "${pluginName}" registered a duplicate route path "${contribution.path}" already registered by plugin "${dup.pluginName}"`,
      );
    }
    this.entries.push({ pluginName, contribution });
  }

  list(): readonly RouteRecord[] {
    return [...this.entries];
  }

  findByPath(path: string): RouteRecord | undefined {
    return this.entries.find((r) => r.contribution.path === path);
  }

  __reset(): void {
    this.entries.length = 0;
  }
}
