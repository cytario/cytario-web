import { createHash, timingSafeEqual } from "node:crypto";

import { createLabel } from "~/.server/logging";

const label = createLabel("connections-api", "cyan");

export const CONNECTIONS_API_SECRET_HEADER = "X-Connections-API-Secret";

// Hashing both sides makes the compare length-invariant (a plaintext
// `timingSafeEqual` throws on a length mismatch, leaking the secret's length).
const SECRET_DIGEST_BYTES = 32; // sha256

function sha256(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

/** Test seam: whether the shared secret gate is armed. */
export function connectionsApiSecretConfigured(): boolean {
  return process.env.CONNECTIONS_API_SECRET !== undefined;
}

// Both sides are sha256-digested so the compare length never varies with the
// input — a caller cannot learn the secret's length or prefix by timing.
// An empty/unset secret fails closed so the API never becomes an open
// endpoint on a misconfigured deploy.
export function connectionsApiSecretMatches(presented: string | null): boolean {
  const configured = process.env.CONNECTIONS_API_SECRET;

  if (!configured) return false;

  if (presented === null) return false;

  const a = sha256(presented);
  const b = sha256(configured);
  if (a.length !== b.length || a.length !== SECRET_DIGEST_BYTES) return false;
  return timingSafeEqual(a, b);
}

export function requireConnectionsApiSecret(request: Request): Response | null {
  const presented = request.headers.get(CONNECTIONS_API_SECRET_HEADER);
  if (!connectionsApiSecretMatches(presented)) {
    // One generic reason for every failure mode — the response must not
    // reveal whether a header was close or whether any secret is armed.
    const reason = "The connections API secret is missing or invalid.";
    console.warn(`${label} 401: ${reason}`);
    return Response.json(
      { error: reason },
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }
  return null;
}
