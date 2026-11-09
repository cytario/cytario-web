import type {
  ServerEndpointAuth,
  ServerEndpointContribution,
  ServerEndpointRegistry,
  ServerEndpointScope,
} from "@cytario/plugin-api";

const VALID_AUTH_MODES = new Set<ServerEndpointAuth>([
  "session",
  "job-token",
  "webhook-secret",
  "deployment-secret",
]);

// The auth modes that may declare `scope: "org-agnostic"`: the carve-outs run
// outside the session gate and have no single-org caller by construction.
const ORG_AGNOSTIC_AUTH_MODES = new Set<ServerEndpointAuth>([
  "job-token",
  "webhook-secret",
  "deployment-secret",
]);

// Paths are plugin-relative: the host
// composes the served URL from the declared scope. This allowlist keeps a
// plugin from capturing host namespaces inside its relative remainder —
// a path that would collide with a core API subtree is rejected.
const PATH_PREFIX_DENYLIST = ["/api/", "/api"] as const;

interface ServerEndpointRecord {
  pluginName: string;
  contribution: ServerEndpointContribution;
}

const scopeOf = (contribution: ServerEndpointContribution): ServerEndpointScope =>
  contribution.scope ?? "org";

// The carve-out endpoints (`job-token`, `webhook-secret`, `deployment-secret`)
// are the only plugin-contributed routes that run outside the session gate —
// first-class, host-reviewed extension points.
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
        `Plugin "${pluginName}" registered a server endpoint path "${contribution.path}" containing a ":" path-param segment. The host matches plugin endpoints by literal pathname, so a param segment never matches a real request and silently 404s at runtime. Pass dynamic values as query params instead (e.g. "/catalog/app" with ?appId=...).`,
      );
    }
    if (PATH_PREFIX_DENYLIST.some((prefix) => contribution.path === prefix)) {
      throw new Error(
        `Plugin "${pluginName}" registered a server endpoint path "${contribution.path}" that collides with the host's API namespace; plugin paths are plugin-relative and the host composes the served URL`,
      );
    }
    if (!VALID_AUTH_MODES.has(contribution.auth)) {
      throw new TypeError(
        `Plugin "${pluginName}" registered a server endpoint "${contribution.path}" with an unknown auth mode "${contribution.auth}"`,
      );
    }
    const scope = scopeOf(contribution);
    if (scope === "org-agnostic" && !ORG_AGNOSTIC_AUTH_MODES.has(contribution.auth)) {
      throw new Error(
        `Plugin "${pluginName}" registered a session endpoint "${contribution.path}" as org-agnostic: a session always has an org to act in — declare scope "org" (the default) or use a carve-out auth mode`,
      );
    }
    if (!contribution.loader && !contribution.action) {
      throw new TypeError(
        `Plugin "${pluginName}" registered a server endpoint "${contribution.path}" with neither a loader nor an action`,
      );
    }
    const dup = this.entries.find(
      (r) => r.contribution.path === contribution.path && scopeOf(r.contribution) === scope,
    );
    if (dup) {
      throw new Error(
        `Plugin "${pluginName}" registered a duplicate server endpoint path "${contribution.path}" (scope ${scope}) already registered by plugin "${dup.pluginName}"`,
      );
    }
    this.entries.push({ pluginName, contribution });
  }

  /** The endpoint served at `pluginRelativePath` under the org-scoped prefix. */
  findOrgScoped(pluginRelativePath: string): ServerEndpointRecord | undefined {
    return this.entries.find(
      (r) => scopeOf(r.contribution) === "org" && r.contribution.path === pluginRelativePath,
    );
  }

  /** The org-agnostic endpoint served at `pluginRelativePath` (carve-outs). */
  findOrgAgnostic(pluginRelativePath: string): ServerEndpointRecord | undefined {
    return this.entries.find(
      (r) =>
        scopeOf(r.contribution) === "org-agnostic" && r.contribution.path === pluginRelativePath,
    );
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
