import type { RedisOptions } from "ioredis";

/**
 * Build ioredis connection options from environment variables.
 *
 * Recognised env vars:
 * - `REDIS_HOST` (default: `localhost`)
 * - `REDIS_PORT` (default: `6379`)
 * - `REDIS_USERNAME` — optional ACL username
 * - `REDIS_PASSWORD` — optional password
 * - `REDIS_TLS` — `"true"` to wrap the connection in TLS
 * - `REDIS_CA_CERT` — PEM-encoded CA certificate (string) used to verify
 *   the server when the cert chain is not in the system trust store
 * - `REDIS_TLS_SERVER_NAME` — SNI / certificate hostname override
 * - `REDIS_INSECURE_ALLOW_PLAINTEXT` — `"true"` to opt out of the
 *   production TLS requirement (escape hatch for trusted in-cluster
 *   networks; logs a warning)
 *
 * Fails fast outside development if TLS is off and the opt-out flag is
 * not set — session blobs contain OAuth tokens and STS credentials and
 * must not traverse plaintext links in production. See C-204.
 */
export function buildRedisOptions(env: Record<string, string | undefined>): RedisOptions {
  const host = env.REDIS_HOST || "localhost";
  const port = Number(env.REDIS_PORT) || 6379;
  const username = env.REDIS_USERNAME;
  const password = env.REDIS_PASSWORD;
  const tlsEnabled = env.REDIS_TLS === "true";
  const caCert = env.REDIS_CA_CERT;
  const tlsServerName = env.REDIS_TLS_SERVER_NAME;
  const allowPlaintext = env.REDIS_INSECURE_ALLOW_PLAINTEXT === "true";
  const nodeEnv = env.NODE_ENV;

  const isLocalEnv = nodeEnv === "development" || nodeEnv === "test";

  if (!tlsEnabled && !isLocalEnv && !allowPlaintext) {
    throw new Error(
      "Refusing to start: Redis/Valkey TLS is disabled. Set REDIS_TLS=true " +
        "(recommended) or REDIS_INSECURE_ALLOW_PLAINTEXT=true to opt out. " +
        "See C-204 / OWASP A02:2021.",
    );
  }

  if (!tlsEnabled && allowPlaintext && !isLocalEnv) {
    console.warn(
      "REDIS_INSECURE_ALLOW_PLAINTEXT=true — session tokens will traverse " +
        "an unencrypted connection. Only safe on a trusted private network.",
    );
  }

  const options: RedisOptions = {
    host,
    port,
    ...(username && { username }),
    ...(password && { password }),
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
    lazyConnect: false,
  };

  if (tlsEnabled) {
    options.tls = {
      ...(caCert && { ca: caCert }),
      ...(tlsServerName && { servername: tlsServerName }),
    };
  }

  return options;
}
