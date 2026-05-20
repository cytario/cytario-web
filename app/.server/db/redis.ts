import Redis from "ioredis";

import { buildRedisOptions } from "./redisOptions";

/**
 * Redis/Valkey client instance
 *
 * This client is compatible with both Redis and Valkey servers.
 * Valkey is a Redis fork that maintains protocol compatibility, so the same
 * ioredis client library works seamlessly with both.
 *
 * Configure connection via environment variables:
 * - REDIS_HOST: Server hostname (e.g., localhost, or your Valkey server)
 * - REDIS_PORT: Server port (default: 6379)
 * - REDIS_USERNAME: Optional username for authenticated connections (Redis 6+ / Valkey)
 * - REDIS_PASSWORD: Optional password for authenticated connections
 * - REDIS_TLS: Set to "true" to wrap the connection in TLS (required in production)
 * - REDIS_CA_CERT: Optional PEM-encoded CA certificate (string) for self-signed deployments
 * - REDIS_TLS_SERVER_NAME: Optional SNI / certificate hostname override
 * - REDIS_INSECURE_ALLOW_PLAINTEXT: Set to "true" to opt out of the production TLS requirement
 *
 * @example
 * // Use with managed Valkey over TLS — Valkey reuses 6379 for TLS when tls.enabled is set
 * REDIS_HOST=valkey.example.com
 * REDIS_PORT=6379
 * REDIS_USERNAME=myuser
 * REDIS_PASSWORD=mypassword
 * REDIS_TLS=true
 *
 * @example
 * // Local development without TLS (only allowed when NODE_ENV=development)
 * REDIS_HOST=localhost
 * REDIS_PORT=6379
 */

const options = buildRedisOptions(process.env);

export const redis = new Redis(options);

redis.on("error", (err) => {
  console.error("Redis/Valkey connection error:", err);
});

redis.on("connect", () => {
  const authInfo = options.username
    ? ` (authenticated as ${options.username})`
    : options.password
      ? " (authenticated)"
      : "";
  const tlsInfo = options.tls ? " over TLS" : "";
  console.log(`Connected to Redis/Valkey at ${options.host}:${options.port}${authInfo}${tlsInfo}`);
});
