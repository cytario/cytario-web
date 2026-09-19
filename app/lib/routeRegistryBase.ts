import type { RouteContribution, RouteRegistry } from "@cytario/plugin-api";

// A path that does not start with one of these is rejected so a plugin route
// cannot shadow a core route. Extend when new plugin route subtrees are
// reserved.
export const ROUTE_PREFIX_ALLOWLIST = ["/plugin"] as const;

export interface RouteRecord {
  pluginName: string;
  contribution: RouteContribution;
}

export function isPathAllowed(path: string): boolean {
  return ROUTE_PREFIX_ALLOWLIST.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

// Validation and duplicate detection are identical in both realms; the realms
// differ only in which fields a plugin populates (loader/action server,
// element client). Unlike UI registries where cross-plugin id collisions are
// tolerated, two plugins cannot own the same route path. Lives outside
// `.server/` so the client singleton can import it without pulling
// server-only code into the client bundle.
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
