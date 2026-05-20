import { describe, expect, test, vi } from "vitest";

import { buildRedisOptions } from "../redisOptions";

const baseEnv = (
  overrides: Record<string, string | undefined> = {},
): Record<string, string | undefined> => ({
  NODE_ENV: "development",
  REDIS_HOST: "valkey.example.com",
  REDIS_PORT: "6379",
  ...overrides,
});

describe("buildRedisOptions", () => {
  describe("defaults", () => {
    test("falls back to localhost:6379 when host/port are unset", () => {
      const options = buildRedisOptions({ NODE_ENV: "development" });
      expect(options.host).toBe("localhost");
      expect(options.port).toBe(6379);
    });

    test("omits username/password when not provided", () => {
      const options = buildRedisOptions(baseEnv());
      expect(options.username).toBeUndefined();
      expect(options.password).toBeUndefined();
    });

    test("includes username and password when provided", () => {
      const options = buildRedisOptions(
        baseEnv({ REDIS_USERNAME: "alice", REDIS_PASSWORD: "secret" }),
      );
      expect(options.username).toBe("alice");
      expect(options.password).toBe("secret");
    });
  });

  describe("TLS off", () => {
    test("does not set the tls option when REDIS_TLS is unset", () => {
      const options = buildRedisOptions(baseEnv());
      expect(options.tls).toBeUndefined();
    });

    test("does not set the tls option when REDIS_TLS is anything but the literal string 'true'", () => {
      const options = buildRedisOptions(baseEnv({ REDIS_TLS: "1" }));
      expect(options.tls).toBeUndefined();
    });

    test("allows plaintext in development", () => {
      expect(() => buildRedisOptions(baseEnv({ NODE_ENV: "development" }))).not.toThrow();
    });

    test("allows plaintext under NODE_ENV=test so the vitest harness can import redis.ts without mocking", () => {
      expect(() => buildRedisOptions(baseEnv({ NODE_ENV: "test" }))).not.toThrow();
    });

    test("throws in production when TLS is off and no opt-out flag is set", () => {
      expect(() => buildRedisOptions(baseEnv({ NODE_ENV: "production" }))).toThrow(
        /Refusing to start.*REDIS_TLS/,
      );
    });

    test("throws in any non-development NODE_ENV (e.g. staging) when TLS is off", () => {
      expect(() => buildRedisOptions(baseEnv({ NODE_ENV: "staging" }))).toThrow(
        /Refusing to start/,
      );
    });

    test("does not throw in production when REDIS_INSECURE_ALLOW_PLAINTEXT=true", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      try {
        expect(() =>
          buildRedisOptions(
            baseEnv({ NODE_ENV: "production", REDIS_INSECURE_ALLOW_PLAINTEXT: "true" }),
          ),
        ).not.toThrow();
        expect(warn).toHaveBeenCalledWith(expect.stringMatching(/REDIS_INSECURE_ALLOW_PLAINTEXT/));
      } finally {
        warn.mockRestore();
      }
    });
  });

  describe("TLS on", () => {
    test("sets an empty tls object when REDIS_TLS=true with no CA/SNI", () => {
      const options = buildRedisOptions(baseEnv({ NODE_ENV: "production", REDIS_TLS: "true" }));
      expect(options.tls).toEqual({});
    });

    test("passes the CA certificate through to the tls option", () => {
      const ca = "-----BEGIN CERTIFICATE-----\nMIIB...\n-----END CERTIFICATE-----";
      const options = buildRedisOptions(
        baseEnv({ NODE_ENV: "production", REDIS_TLS: "true", REDIS_CA_CERT: ca }),
      );
      expect(options.tls).toEqual({ ca });
    });

    test("passes the SNI/server name through to the tls option", () => {
      const options = buildRedisOptions(
        baseEnv({
          NODE_ENV: "production",
          REDIS_TLS: "true",
          REDIS_TLS_SERVER_NAME: "valkey.internal",
        }),
      );
      expect(options.tls).toEqual({ servername: "valkey.internal" });
    });

    test("does not throw in production when TLS is on", () => {
      expect(() =>
        buildRedisOptions(baseEnv({ NODE_ENV: "production", REDIS_TLS: "true" })),
      ).not.toThrow();
    });
  });
});
