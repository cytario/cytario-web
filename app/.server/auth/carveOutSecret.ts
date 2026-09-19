import { createHash, timingSafeEqual } from "node:crypto";

import type { ServerEndpointAuth } from "@cytario/plugin-api";

// SHA-256 on both operands feeds `timingSafeEqual` fixed-length buffers —
// a raw length compare would leak the secret's length by timing.
export function constantTimeSecretMatch(
  presented: string | null | undefined,
  expected: string | null | undefined,
): boolean {
  if (!presented || !expected) return false;
  const a = createHash("sha256").update(presented).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export function readBearerCredential(request: Request): string | null {
  const header = request.headers.get("Authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1].trim() : null;
}

const SECRET_ENV_VARS: Partial<Record<ServerEndpointAuth, string>> = {
  "deployment-secret": "RECONCILE_SECRET",
  "webhook-secret": "PLUGIN_WEBHOOK_SECRET",
};

export function carveOutSecretEnvName(auth: ServerEndpointAuth): string | undefined {
  return SECRET_ENV_VARS[auth];
}

// An absent or empty env var fails closed — a missing configuration must
// not open the endpoint.
export function verifyCarveOutSecret(request: Request, auth: ServerEndpointAuth): boolean {
  const envName = SECRET_ENV_VARS[auth];
  if (!envName) return false;
  const presented = readBearerCredential(request);
  const expected = process.env[envName];
  return constantTimeSecretMatch(presented, expected);
}
