import { createHash, timingSafeEqual } from "node:crypto";

import type { ServerEndpointAuth } from "@cytario/plugin-api";

/**
 * Constant-time shared-secret check for carve-out dispatches. SHA-256 on both
 * operands keeps `timingSafeEqual` fed fixed-length buffers — a raw length
 * compare would leak the configured secret's length by timing.
 */
export function constantTimeSecretMatch(
  presented: string | null | undefined,
  expected: string | null | undefined,
): boolean {
  if (!presented || !expected) return false;
  const a = createHash("sha256").update(presented).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/**
 * Reads the `Authorization: Bearer <secret>` credential, returning `null` when
 * absent or malformed.
 */
export function readBearerCredential(request: Request): string | null {
  const header = request.headers.get("Authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1].trim() : null;
}

/**
 * Env var backing a `*-secret` carve-out auth mode.
 */
const SECRET_ENV_VARS: Partial<Record<ServerEndpointAuth, string>> = {
  "deployment-secret": "RECONCILE_SECRET",
  "webhook-secret": "PLUGIN_WEBHOOK_SECRET",
};

export function carveOutSecretEnvName(auth: ServerEndpointAuth): string | undefined {
  return SECRET_ENV_VARS[auth];
}

/**
 * Verifies the shared secret a `*-secret` carve-out must present. The expected
 * secret is read from the env var mapped for the auth mode; both are hashed
 * before the constant-time compare, and an absent or empty env var fails
 * closed — a missing configuration must not open the endpoint.
 */
export function verifyCarveOutSecret(request: Request, auth: ServerEndpointAuth): boolean {
  const envName = SECRET_ENV_VARS[auth];
  if (!envName) return false;
  const presented = readBearerCredential(request);
  const expected = process.env[envName];
  return constantTimeSecretMatch(presented, expected);
}
