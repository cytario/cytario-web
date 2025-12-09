import Redis from "ioredis";

import { cytarioConfig } from "~/config";

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
 *
 * @example
 * // Use with Redis without authentication
 * REDIS_HOST=redis.example.com
 * REDIS_PORT=6379
 *
 * @example
 * // Use with Valkey with authentication
 * REDIS_HOST=valkey.example.com
 * REDIS_PORT=6379
 * REDIS_USERNAME=myuser
 * REDIS_PASSWORD=mypassword
 *
 * @example
 * // Use with Redis/Valkey with password-only authentication (legacy)
 * REDIS_HOST=redis.example.com
 * REDIS_PORT=6379
 * REDIS_PASSWORD=mypassword
 */

const {
  redis: { host, port, username, password },
} = cytarioConfig;

export const redis = new Redis({
  host,
  port,
  // Only include username if provided (Redis 6+ ACL support)
  ...(username && { username }),
  // Only include password if provided (backwards compatible)
  ...(password && { password }),
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  lazyConnect: false,
});

// Log connection errors
redis.on("error", (err) => {
  console.error("Redis/Valkey connection error:", err);
});

redis.on("connect", () => {
  const authInfo = username ? ` (authenticated as ${username})` : password ? " (authenticated)" : "";
  console.log(`Connected to Redis/Valkey at ${host}:${port}${authInfo}`);
});
