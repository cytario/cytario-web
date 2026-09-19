import Redis from "ioredis";

import { buildRedisOptions } from "./redisOptions";

// Valkey is a protocol-compatible Redis fork, so the same ioredis client
// works with both. Env vars are documented in redisOptions.ts.

const options = buildRedisOptions(process.env);

const auth = options.password ? "on" : "off";
const tls = options.tls ? "on" : "off";
const who = options.username ? ` as ${options.username}` : "";
const prefix = options.keyPrefix ? `, prefix "${options.keyPrefix}"` : "";
console.log(
  `Redis/Valkey config: ${options.host}:${options.port}${who} (AUTH ${auth}, TLS ${tls}${prefix})`,
);

export const redis = new Redis(options);

redis.on("error", (err) => {
  console.error("Redis/Valkey connection error:", err);
});

redis.on("connect", () => {
  console.log(`Connected to Redis/Valkey at ${options.host}:${options.port}`);
});
