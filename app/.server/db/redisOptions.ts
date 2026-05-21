import type { RedisOptions } from "ioredis";

/**
 * Build ioredis connection options from environment variables.
 *
 * Recognised env vars:
 * - `REDIS_HOST` (default: `localhost`)
 * - `REDIS_PORT` (default: `6379`)
 * - `REDIS_USERNAME` — optional ACL username
 * - `REDIS_PASSWORD` — password; required outside development
 * - `REDIS_KEY_PREFIX` — optional prefix prepended to every key issued by
 *   this client (e.g. `"cytario-web:"`). Lets operators scope the app to a
 *   single ACL keyspace pattern without code changes.
 * - `REDIS_TLS` — `"true"` to wrap the connection in TLS
 * - `REDIS_CA_CERT` — PEM-encoded CA certificate (string) used to verify
 *   the server when the cert chain is not in the system trust store
 * - `REDIS_TLS_SERVER_NAME` — SNI / certificate hostname override
 * - `REDIS_INSECURE_ALLOW_PLAINTEXT` — `"true"` to opt out of the
 *   production TLS requirement (escape hatch for trusted in-cluster
 *   networks; logs a warning)
 *
 * Fails fast outside development if:
 *   - TLS is off and the opt-out flag is not set, or
 *   - `REDIS_PASSWORD` is empty.
 *
 * Session blobs contain OAuth tokens and STS credentials and must never
 * traverse plaintext links or be readable by anonymous clients in
 * production.
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
  const keyPrefix = env.REDIS_KEY_PREFIX;
  const nodeEnv = env.NODE_ENV;

  const isLocalEnv = nodeEnv === "development" || nodeEnv === "test";

  if (!isLocalEnv && !password) {
    throw new Error(
      "Refusing to start: Redis/Valkey AUTH is disabled. Set REDIS_PASSWORD " +
        "to a non-empty value so the session store rejects anonymous clients.",
    );
  }

  if (!tlsEnabled && !isLocalEnv && !allowPlaintext) {
    throw new Error(
      "Refusing to start: Redis/Valkey TLS is disabled. Set REDIS_TLS=true " +
        "(recommended) or REDIS_INSECURE_ALLOW_PLAINTEXT=true to opt out.",
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
    ...(keyPrefix && { keyPrefix }),
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
