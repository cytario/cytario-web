import { CookieOptions } from "react-router";

interface CytarioConfig {
  endpoints: {
    webapp: string;
    /** Customer portal base URL. Unset on deployments without a portal (e.g. OSS). */
    portal?: string;
  };
  auth: {
    baseUrl: string;
    clientId: string;
    clientSecret: string;
    /** Dedicated OIDC client ID for Cyberduck (public client with PKCE) */
    cyberduckClientId: string;
    /** Dedicated service account client for KC Admin API calls (client_credentials grant) */
    adminClientId: string;
    adminClientSecret: string;
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
  };
  cookie: CookieOptions;
}

const {
  BASE_URL,
  CLIENT_ID,
  CLIENT_SECRET,
  CYBERDUCK_CLIENT_ID,
  KC_ADMIN_CLIENT_ID,
  KC_ADMIN_CLIENT_SECRET,
  REDIS_PORT,
  REDIS_HOST,
  REDIS_USERNAME,
  REDIS_PASSWORD,
  COOKIE_SECRET,
  NODE_ENV,
  WEB_HOST,
  PORTAL_HOST,
  PORTAL_INTERNAL_URL,
  PROVIDERS_LOOKUP_SECRET,
  PROVIDERS_OSS_CONFIG_PATH,
} = process.env;

// Admin-portal builds (EE/SaaS) resolve provider connections/roles from the
// portal lookup; OSS builds read them from a deploy-time YAML file.
// Portal presence is signalled by PORTAL_INTERNAL_URL.
const providersSource: "portal" | "oss" = PORTAL_INTERNAL_URL ? "portal" : "oss";

export const cytarioConfig: Readonly<CytarioConfig> = {
  endpoints: {
    webapp: WEB_HOST!,
    portal: PORTAL_HOST,
  },
  auth: {
    baseUrl: BASE_URL!,
    clientId: CLIENT_ID!,
    clientSecret: CLIENT_SECRET!,
    cyberduckClientId: CYBERDUCK_CLIENT_ID!,
    adminClientId: KC_ADMIN_CLIENT_ID!,
    adminClientSecret: KC_ADMIN_CLIENT_SECRET!,
    scopes: ["openid", "profile", "organization"],
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
  },
  cookie: {
    httpOnly: true,
    secure: NODE_ENV !== "development",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24, // 1 day
    secrets: [COOKIE_SECRET!],
  },
};
