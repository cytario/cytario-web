import { decodeJwt } from "jose";
import { LRUCache } from "lru-cache";
import { z } from "zod";

import { getWellKnownEndpoints } from "./wellKnownEndpoints";
import { cytarioConfig } from "~/config";

// Parsed rather than cast: a proxy or misconfigured realm can answer 200 with an
// HTML page or an `error` body, and that must fail at the boundary.
// Per RFC 8693 §2.2.1 (and Keycloak's token-exchange guide), an exchange with
// `requested_token_type=id_token` still returns the issued token in the
// `access_token` response field — the token inside is an ID token (carrying
// `aud`), despite the field name.
const tokenExchangeResponseSchema = z.object({
  access_token: z.string().min(1),
  issued_token_type: z.string().optional(),
});

const TOKEN_EXCHANGE_GRANT = "urn:ietf:params:oauth:grant-type:token-exchange";
const ACCESS_TOKEN_TYPE = "urn:ietf:params:oauth:token-type:access_token";

// The mint presents the exchanged token to AssumeRoleWithWebIdentity, which
// validates the `aud` claim against the OIDC provider's registered audiences.
// A Keycloak access token carries no `aud` by default (the job-broker client
// needed a dedicated audience mapper for the same reason), while an ID token
// natively carries `aud` = the requesting client — so the exchange requests an
// ID token, matching the shape the mint presented before the multi-org change.
const ID_TOKEN_TYPE = "urn:ietf:params:oauth:token-type:id_token";

// The alias is interpolated into the exchange `scope` as `organization:<alias>`,
// so this guard blocks values (spaces, colons, control chars) that could inject
// extra scope tokens. Keycloak still rejects an alias the user is not a member
// of, so a forged alias cannot widen access — the exchange is the trust boundary.
const ORG_ALIAS_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

/** Re-minted with a 60s margin so a cached token is never handed out near expiry. */
const EXPIRY_BUFFER_MS = 60_000;
const MAX_CACHED_TOKENS = 200;

export interface ExchangedOrgToken {
  accessToken: string;
  /** Epoch milliseconds from the token's own `exp`. */
  expiresAt: number;
  organization: string;
}

export class OrgTokenExchangeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrgTokenExchangeError";
  }
}

// In-process only: a narrow token is a per-request artifact, and keeping it out
// of Redis means a session store leak cannot expose extra orgs' tokens.
const tokenCache = new LRUCache<string, ExchangedOrgToken>({
  max: MAX_CACHED_TOKENS,
  ttlAutopurge: true,
});

const cacheKey = (sessionId: string, alias: string): string => `${sessionId}:${alias}`;

const requireAlias = (alias: string): string => {
  if (!ORG_ALIAS_PATTERN.test(alias)) {
    throw new OrgTokenExchangeError("The requested organization alias is malformed.");
  }
  return alias;
};

// Keycloak just minted this token, so its signature is implicitly trustworthy
// for this in-process read — decode only to learn when it expires.
const readExpiry = (accessToken: string): number => {
  let expiry: number;
  try {
    const { exp } = decodeJwt(accessToken);
    expiry = typeof exp === "number" ? exp * 1000 : Number.NaN;
  } catch {
    throw new OrgTokenExchangeError("The exchanged token is not a valid JWT.");
  }
  if (!Number.isFinite(expiry)) {
    throw new OrgTokenExchangeError("The exchanged token carries no expiry.");
  }
  return expiry;
};

/**
 * RFC 8693 token exchange for one organization: swaps the multi-org session
 * access token for a token carrying exactly `organization:<alias>`. Keycloak
 * rejects the exchange when the user is not a member of that org, which is what
 * makes the narrow token a membership enforcement, not just a filter.
 *
 * Realm prerequisite: the cytario-web client must have "Standard token
 * exchange" enabled, and the `organization` client scope assignable to it;
 * without them the POST below fails and every mint fails closed.
 */
export async function exchangeOrgToken({
  alias,
  subjectToken,
}: {
  alias: string;
  subjectToken: string;
}): Promise<ExchangedOrgToken> {
  const organization = requireAlias(alias);
  if (!subjectToken) {
    throw new OrgTokenExchangeError("A subject token is required for the token exchange.");
  }

  const { token_endpoint } = await getWellKnownEndpoints();
  const { clientId, clientSecret } = cytarioConfig.auth;

  const response = await fetch(token_endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: TOKEN_EXCHANGE_GRANT,
      subject_token: subjectToken,
      subject_token_type: ACCESS_TOKEN_TYPE,
      requested_token_type: ID_TOKEN_TYPE,
      scope: `openid organization:${organization}`,
    }),
  });

  if (!response.ok) {
    // An expired subject token, a non-membership, or a refused exchange all land
    // here; the body is drained but never surfaced or logged.
    await response.text().catch(() => "");
    throw new OrgTokenExchangeError(
      `Organization token exchange rejected: ${response.status} ${response.statusText}`,
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new OrgTokenExchangeError("The organization token exchange returned invalid JSON.");
  }

  const parsed = tokenExchangeResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new OrgTokenExchangeError("The organization token exchange returned no token.");
  }
  if (parsed.data.issued_token_type && parsed.data.issued_token_type !== ID_TOKEN_TYPE) {
    throw new OrgTokenExchangeError(
      `The organization token exchange issued ${parsed.data.issued_token_type}, expected an ID token.`,
    );
  }

  return {
    accessToken: parsed.data.access_token,
    expiresAt: readExpiry(parsed.data.access_token),
    organization,
  };
}

/**
 * The narrow token for `(sessionId, alias)`, minted on first use and reused
 * until its expiry margin runs out. Throws rather than returning the subject
 * token: a credential mint must never fall back to a token carrying other orgs.
 */
export async function getOrExchangeOrgToken(
  sessionId: string,
  alias: string,
  subjectToken: string,
): Promise<ExchangedOrgToken> {
  const key = cacheKey(sessionId, alias);
  const cached = tokenCache.get(key);
  if (cached) return cached;

  const exchanged = await exchangeOrgToken({ alias, subjectToken });
  const ttl = exchanged.expiresAt - Date.now() - EXPIRY_BUFFER_MS;
  if (ttl > 0) {
    tokenCache.set(key, exchanged, { ttl });
  }
  return exchanged;
}

/** Test-only: drop cached tokens so a case starts from a cold cache. */
export function __resetOrgTokenCache(): void {
  tokenCache.clear();
}
