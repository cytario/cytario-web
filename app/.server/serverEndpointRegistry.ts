import type {
  ServerEndpointAuth,
  ServerEndpointContribution,
  ServerEndpointRegistry,
} from "@cytario/plugin-api";

const VALID_AUTH_MODES = new Set<ServerEndpointAuth>([
  "session",
  "job-token",
  "webhook-secret",
  "deployment-secret",
]);

/**
 * Path prefixes a plugin may contribute server endpoints under. A path that
 * does not start with one of these is rejected so a plugin endpoint cannot
 * shadow a core API route (SDS-CY-010095). Extend this list when new plugin
 * endpoint subtrees are reserved.
 */
const ENDPOINT_PREFIX_ALLOWLIST = ["/api/plugin"] as const;

interface ServerEndpointRecord {
  pluginName: string;
  contribution: ServerEndpointContribution;
}

/**
 * Server-only endpoint registry. Mirrors the `gateRegistry` / `routeRegistry`
 * singleton pattern: `scopedFor(pluginName)` binds the plugin name at register
 * time. Lives under a `.server` path so it never enters the client bundle.
 *
 * The registry validates contributed paths and auth modes, and detects
 * duplicate path registrations. The carve-out endpoints (`job-token`,
 * `webhook-secret`, `deployment-secret`) are the only plugin-contributed
 * routes that run outside the session gate (SDS-CY-010095) — they are
 * first-class, host-reviewed extension points.
 */
class ServerEndpointRegistryImpl {
  private readonly entries: ServerEndpointRecord[] = [];

  scopedFor(pluginName: string): ServerEndpointRegistry {
    return {
      register: (contribution) => this.add(pluginName, contribution),
    };
  }

  add(pluginName: string, contribution: ServerEndpointContribution): void {
    if (!contribution || typeof contribution !== "object") {
      throw new TypeError(
        `Plugin "${pluginName}" registered a non-object server-endpoint contribution`,
      );
    }
    if (typeof contribution.path !== "string" || contribution.path.length === 0) {
      throw new TypeError(
        `Plugin "${pluginName}" registered a server endpoint with a missing or empty path`,
      );
    }
    if (!contribution.path.startsWith("/")) {
      throw new TypeError(
        `Plugin "${pluginName}" registered a server endpoint path "${contribution.path}" that does not start with "/"`,
      );
    }
    if (contribution.path.includes(":")) {
      throw new TypeError(
        `Plugin "${pluginName}" registered a server endpoint path "${contribution.path}" containing a ":" path-param segment. The host matches plugin endpoints by literal pathname, so a param segment never matches a real request and silently 404s at runtime. Pass dynamic values as query params instead (e.g. "/api/plugin/catalog/app" with ?appId=...).`,
      );
    }
    if (
      !ENDPOINT_PREFIX_ALLOWLIST.some(
        (prefix) => contribution.path.startsWith(`${prefix}/`) || contribution.path === prefix,
      )
    ) {
      throw new Error(
        `Plugin "${pluginName}" registered a server endpoint path "${contribution.path}" outside the reserved-prefix allowlist [${ENDPOINT_PREFIX_ALLOWLIST.join(", ")}]`,
      );
    }
    if (!VALID_AUTH_MODES.has(contribution.auth)) {
      throw new TypeError(
        `Plugin "${pluginName}" registered a server endpoint "${contribution.path}" with an unknown auth mode "${contribution.auth}"`,
      );
    }
    if (!contribution.loader && !contribution.action) {
      throw new TypeError(
        `Plugin "${pluginName}" registered a server endpoint "${contribution.path}" with neither a loader nor an action`,
      );
    }
    const dup = this.entries.find((r) => r.contribution.path === contribution.path);
    if (dup) {
      throw new Error(
        `Plugin "${pluginName}" registered a duplicate server endpoint path "${contribution.path}" already registered by plugin "${dup.pluginName}"`,
      );
    }
    this.entries.push({ pluginName, contribution });
  }

  list(): readonly ServerEndpointRecord[] {
    return [...this.entries];
  }

  __reset(): void {
    this.entries.length = 0;
  }
}

export const serverEndpointRegistry = new ServerEndpointRegistryImpl();

export type { ServerEndpointRegistryImpl };
