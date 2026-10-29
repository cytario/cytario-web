import { CookieOptions } from "react-router";

interface CytarioConfig {
  endpoints: {
    webapp: string;
    /** Customer portal base URL. Unset on deployments without a portal (e.g. OSS). */
    portal?: string;
    /** External user documentation base URL. Unset on deployments without docs. */
    docsUrl?: string;
    /**
     * Externally-reachable base URL of this deployment for callers outside
     * the browser origin (compute jobs calling the credential broker back).
     * Defaults to the browser origin.
     */
    brokerPublicUrl?: string;
  };
  /** Contact address for user support, shown in the help menu. Unset = hidden. */
  support?: {
    email?: string;
  };
  auth: {
    baseUrl: string;
    clientId: string;
    clientSecret: string;
    /** Dedicated OIDC client ID for Cyberduck (public client with PKCE) */
    cyberduckClientId: string;
    /** Dedicated public OIDC client ID for the cytario CLI (PKCE, loopback redirect) */
    cliClientId: string;
    /** Dedicated service account client for KC Admin API calls (client_credentials grant) */
    adminClientId: string;
    adminClientSecret: string;
    /**
     * Confidential client for the offline-capable job token grant (RFC 8693
     * token exchange). `ctx.host.exchangeToken()` exchanges the user's
     * session token for an offline-capable grant with this client as the
     * audience.
     */
    jobBrokerClientId: string;
    jobBrokerClientSecret: string;
    scopes: string[];
  };
  redis: {
    /** Redis/Valkey server port (default: 6379) */
    port: number;
    /** Redis/Valkey server hostname */
    host: string;
    /** Optional username for authenticated connections (Redis 6+ ACL / Valkey) */
    username?: string;
    /** Password for authenticated connections. Optional in development only */
    password?: string;
  };
  /**
   * Source of the selectable provider connections and provider roles that back
   * the connection-creation and share selectors.
   * `portal` in admin-portal builds (EE/SaaS); `oss` when self-hosted without a
   * portal. The source is fixed by admin-portal presence at deploy time.
   */
  providers: {
    source: "portal" | "oss";
    /**
     * Internal base URL of the admin portal (server-to-server, never exposed to
     * the browser). Present only in `portal` builds. Lookup endpoint:
     * `GET {portalInternalUrl}/org/providers`.
     */
    portalInternalUrl?: string;
    /**
     * Shared secret sent to the portal lookup as the `X-Providers-Lookup-Secret`
     * header (constant-time compared server-side). Present only in `portal` builds.
     */
    lookupSecret?: string;
    /**
     * Path to the deploy-time YAML provider catalog. Present only in `oss` builds.
     * Mirrors the lookup JSON shape.
     */
    ossConfigPath?: string;
    /**
     * How long a failed provider/bucket catalog lookup is remembered before
     * the next call retries the portal. Failure memoization only — successes
     * are never served beyond the burst window.
     */
    catalogFailureBackoffMs: number;
    /**
     * Default endpoint and region of the built-in public provider connection
     * ("Public") appended to every resolved provider catalog, in portal and
     * OSS builds alike. Self-hosted deployments point the default at a public
     * S3-compatible mirror via CYTARIO_PUBLIC_PROVIDER_ENDPOINT /
     * CYTARIO_PUBLIC_PROVIDER_REGION; a connection may override the endpoint
     * per-connection (publicEndpoint), which leaves these env vars as the
     * default (AWS when unset). Setting CYTARIO_PUBLIC_PROVIDER_ENDPOINT to
     * the empty string opts out entirely — for deployments that curate their
     * public catalogs another way.
     */
    builtinPublicProvider: {
      /** null = the built-in public provider is disabled (opt-out). */
      endpoint: string | null;
      region: string;
    };
  };
  /** Base64-encoded 32-byte AES-256-GCM key for secrets held in Postgres. */
  dbEncryptionKey?: string;
  cookie: CookieOptions;
}

const {
  BASE_URL,
  CLIENT_ID,
  CLIENT_SECRET,
  CYBERDUCK_CLIENT_ID,
  CYTARIO_CLI_CLIENT_ID,
  KC_ADMIN_CLIENT_ID,
  KC_ADMIN_CLIENT_SECRET,
  KC_JOB_BROKER_CLIENT_ID,
  KC_JOB_BROKER_CLIENT_SECRET,
  REDIS_PORT,
  REDIS_HOST,
  REDIS_USERNAME,
  REDIS_PASSWORD,
  COOKIE_SECRET,
  NODE_ENV,
  WEB_HOST,
  PORTAL_HOST,
  DOCS_URL,
  SUPPORT_EMAIL,
  PORTAL_INTERNAL_URL,
  BROKER_PUBLIC_URL,
  PROVIDERS_LOOKUP_SECRET,
  PROVIDERS_OSS_CONFIG_PATH,
  CATALOG_FAILURE_BACKOFF_MS,
  CYTARIO_PUBLIC_PROVIDER_ENDPOINT,
  CYTARIO_PUBLIC_PROVIDER_REGION,
  DB_ENCRYPTION_KEY,
} = process.env;

// Portal presence is signalled by PORTAL_INTERNAL_URL: admin-portal builds
// (EE/SaaS) resolve provider connections/roles from the portal lookup; OSS
// builds read them from a deploy-time YAML file.
const providersSource: "portal" | "oss" = PORTAL_INTERNAL_URL ? "portal" : "oss";

const DEFAULT_PUBLIC_PROVIDER_ENDPOINT = "https://s3.us-east-1.amazonaws.com";
const DEFAULT_PUBLIC_PROVIDER_REGION = "us-east-1";

// Same carve-out shape as the S3-host allowlist: loopback http only ever in a
// local environment, so a misconfigured deployment cannot boot pointing the
// anonymous probe at an arbitrary plaintext intranet host.
const isLoopbackHttpUrl = (url: URL): boolean =>
  url.protocol === "http:" &&
  (url.hostname === "localhost" || url.hostname === "127.0.0.1") &&
  (NODE_ENV === "development" || NODE_ENV === "test");

function parsePublicProviderEndpoint(raw: string | undefined): string | null {
  if (raw === "") return null;
  const value = raw ?? DEFAULT_PUBLIC_PROVIDER_ENDPOINT;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(
      `Refusing to start: CYTARIO_PUBLIC_PROVIDER_ENDPOINT "${value}" is not a valid URL — set an https:// endpoint, or "" to disable the built-in public provider.`,
    );
  }
  if (parsed.protocol !== "https:" && !isLoopbackHttpUrl(parsed)) {
    throw new Error(
      `Refusing to start: CYTARIO_PUBLIC_PROVIDER_ENDPOINT "${value}" must be an https:// URL (loopback http://localhost[:port] or http://127.0.0.1[:port] is allowed in development and test) — or "" to disable the built-in public provider.`,
    );
  }
  return value;
}

export const cytarioConfig: Readonly<CytarioConfig> = {
  endpoints: {
    webapp: WEB_HOST!,
    portal: PORTAL_HOST,
    docsUrl: DOCS_URL,
    brokerPublicUrl: BROKER_PUBLIC_URL,
  },
  support: {
    email: SUPPORT_EMAIL,
  },
  auth: {
    baseUrl: BASE_URL!,
    clientId: CLIENT_ID!,
    clientSecret: CLIENT_SECRET!,
    cyberduckClientId: CYBERDUCK_CLIENT_ID!,
    cliClientId: CYTARIO_CLI_CLIENT_ID!,
    adminClientId: KC_ADMIN_CLIENT_ID!,
    adminClientSecret: KC_ADMIN_CLIENT_SECRET!,
    jobBrokerClientId: KC_JOB_BROKER_CLIENT_ID!,
    jobBrokerClientSecret: KC_JOB_BROKER_CLIENT_SECRET!,
    // `organization:*` resolves every membership into the token's multi-key
    // `organization` claim; the active tenant is chosen in the session, and a
    // per-org token is minted by token exchange (see .server/auth/orgTokenExchange).
    scopes: ["openid", "profile", "organization:*"],
  },
  redis: {
    port: Number(REDIS_PORT) || 6379,
    host: REDIS_HOST || "localhost",
    username: REDIS_USERNAME,
    password: REDIS_PASSWORD,
  },
  providers: {
    source: providersSource,
    portalInternalUrl: PORTAL_INTERNAL_URL,
    lookupSecret: PROVIDERS_LOOKUP_SECRET,
    ossConfigPath: PROVIDERS_OSS_CONFIG_PATH,
    catalogFailureBackoffMs:
      CATALOG_FAILURE_BACKOFF_MS !== undefined && CATALOG_FAILURE_BACKOFF_MS !== ""
        ? Number(CATALOG_FAILURE_BACKOFF_MS)
        : 5_000,
    builtinPublicProvider: {
      endpoint: parsePublicProviderEndpoint(CYTARIO_PUBLIC_PROVIDER_ENDPOINT),
      region: CYTARIO_PUBLIC_PROVIDER_REGION || DEFAULT_PUBLIC_PROVIDER_REGION,
    },
  },
  dbEncryptionKey: DB_ENCRYPTION_KEY,
  cookie: {
    httpOnly: true,
    secure: NODE_ENV !== "development",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24, // 1 day
    secrets: [COOKIE_SECRET!],
  },
};
