import { createHash, timingSafeEqual } from "node:crypto";

import { createLabel } from "~/.server/logging";

const label = createLabel("connections-api", "cyan");

/** The header the admin portal presents the shared secret in. */
export const CONNECTIONS_API_SECRET_HEADER = "X-Connections-API-Secret";

/**
 * Digest length guard for the constant-time compare: hashing both sides makes
 * the compare length-invariant (a plaintext `timingSafeEqual` throws on a
 * length mismatch, which would leak the secret's length to the caller).
 */
const SECRET_DIGEST_BYTES = 32; // sha256

function sha256(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

/** Test seam: whether the shared secret gate is armed. */
export function connectionsApiSecretConfigured(): boolean {
  return process.env.CONNECTIONS_API_SECRET !== undefined;
}

/**
 * Constant-time shared-secret compare for the service-to-service connections
 * API. Both the presented header and the configured secret are digested with
 * sha256 first so the compare length never varies with the input, and the
 * compare itself runs in constant time — a caller cannot learn the secret's
 * length or prefix by timing responses.
 *
 * An empty/unset configured secret fails closed: every request is rejected,
 * because an unset secret means the API was never armed for callers and any
 * acceptance would be an open endpoint. The only exception is the test
 * environment, where the secret is injected explicitly per test.
 */
export function connectionsApiSecretMatches(presented: string | null): boolean {
  const configured = process.env.CONNECTIONS_API_SECRET;

  // Fail closed when the secret is unset or empty: the endpoint must not
  // become an unauthenticated admin surface on a misconfigured deploy. In
  // tests the secret is set explicitly, so this branch is only ever hit
  // through a test that asserts the closed behaviour itself.
  if (!configured) return false;

  if (presented === null) return false;

  const a = sha256(presented);
  const b = sha256(configured);
  if (a.length !== b.length || a.length !== SECRET_DIGEST_BYTES) return false;
  return timingSafeEqual(a, b);
}

/**
 * Guard for `/api/connections/*`: the caller is a trusted service (admin
 * portal onboarding) presenting the deployment's shared secret. A request
 * without the header, with the wrong secret, or when the secret is unset
 * (fail closed) is a 401 JSON error.
 */
export function requireConnectionsApiSecret(request: Request): Response | null {
  const presented = request.headers.get(CONNECTIONS_API_SECRET_HEADER);
  if (!connectionsApiSecretMatches(presented)) {
    // One generic reason for every failure mode — the response must not
    // reveal whether a header was close, or whether any secret is armed.
    const reason = "The connections API secret is missing or invalid.";
    console.warn(`${label} 401: ${reason}`);
    return Response.json(
      { error: reason },
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }
  return null;
}
