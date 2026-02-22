import { CookieOptions } from "react-router";

interface CytarioConfig {
  setup: {
    allowedFiles: string;
  };
  endpoints: {
    webapp: string;
  };
  auth: {
    baseUrl: string;
    clientId: string;
    clientSecret: string;
    /** Dedicated OIDC client ID for Cyberduck (public client with PKCE) */
    cyberduckClientId: string;
    scopes: string[];
  };
  redis: {
    /** Redis/Valkey server port (default: 6379) */
    port: number;
    /** Redis/Valkey server hostname */
    host: string;
    /** Optional username for authenticated connections (Redis 6+ ACL / Valkey) */
    username?: string;
    /** Optional password for authenticated connections */
    password?: string;
  };
  cookie: CookieOptions;
}

const {
  ALLOWED_FILES,
  BASE_URL,
  CLIENT_ID,
  CLIENT_SECRET,
  CYBERDUCK_CLIENT_ID,
  SCOPES,
  REDIS_PORT,
  REDIS_HOST,
  REDIS_USERNAME,
  REDIS_PASSWORD,
  COOKIE_SECRET,
  NODE_ENV,
  WEB_HOST,
} = process.env;

export const cytarioConfig: Readonly<CytarioConfig> = {
  setup: {
    allowedFiles: ALLOWED_FILES ?? ".*",
  },
  endpoints: {
    webapp: WEB_HOST!,
  },
  auth: {
    baseUrl: BASE_URL!,
    clientId: CLIENT_ID!,
    clientSecret: CLIENT_SECRET!,
    cyberduckClientId: CYBERDUCK_CLIENT_ID!,
    scopes: SCOPES!.split(","),
  },
  redis: {
    port: Number(REDIS_PORT) || 6379,
    host: REDIS_HOST || "localhost",
    username: REDIS_USERNAME,
    password: REDIS_PASSWORD,
  },
  cookie: {
    httpOnly: true,
    secure: NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24, // 1 day
    secrets: [COOKIE_SECRET!],
  },
};
