import { createHash } from "crypto";

import { redis } from "../../db/redis";
import {
  generateCodeChallenge,
  generateCodeVerifier,
  generateNonce,
  generateOAuthState,
  validateOAuthState,
  validateRedirectTo,
} from "../oauthState";

vi.mock("../../db/redis", () => ({
  redis: {
    setex: vi.fn(),
    getdel: vi.fn(),
  },
}));

describe("oauthState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("generateCodeVerifier", () => {
    test("generates a base64url string of 43 characters", () => {
      const verifier = generateCodeVerifier();
      expect(verifier).toHaveLength(43);
      expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    test("generates unique verifiers", () => {
      const v1 = generateCodeVerifier();
      const v2 = generateCodeVerifier();
      expect(v1).not.toBe(v2);
    });
  });

  describe("generateCodeChallenge", () => {
    test("generates S256 challenge from verifier", () => {
      const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
      const expected = createHash("sha256")
        .update(verifier)
        .digest("base64url");
      expect(generateCodeChallenge(verifier)).toBe(expected);
    });

    test("produces deterministic output for same input", () => {
      const verifier = generateCodeVerifier();
      const c1 = generateCodeChallenge(verifier);
      const c2 = generateCodeChallenge(verifier);
      expect(c1).toBe(c2);
    });
  });

  describe("generateNonce", () => {
    test("generates a 32-character hex string", () => {
      const nonce = generateNonce();
      expect(nonce).toMatch(/^[a-f0-9]{32}$/);
    });

    test("generates unique nonces", () => {
      const n1 = generateNonce();
      const n2 = generateNonce();
      expect(n1).not.toBe(n2);
    });
  });

  describe("validateRedirectTo", () => {
    test("returns / for undefined input", () => {
      expect(validateRedirectTo(undefined)).toBe("/");
    });

    test("returns / for empty string", () => {
      expect(validateRedirectTo("")).toBe("/");
    });

    test("preserves valid relative paths", () => {
      expect(validateRedirectTo("/buckets")).toBe("/buckets");
    });

    test("preserves query params and hash", () => {
      expect(validateRedirectTo("/page?q=1#section")).toBe(
        "/page?q=1#section",
      );
    });

    test("rejects absolute URLs (different origin)", () => {
      expect(validateRedirectTo("https://evil.com/steal")).toBe("/");
    });

    test("rejects protocol-relative URLs", () => {
      expect(validateRedirectTo("//evil.com")).toBe("/");
    });

    test("rejects backslash bypass vectors", () => {
      expect(validateRedirectTo("\\/evil.com")).toBe("/");
    });

    test("rejects javascript: URIs", () => {
      expect(validateRedirectTo("javascript:alert(1)")).toBe("/");
    });

    test("rejects data: URIs", () => {
      expect(validateRedirectTo("data:text/html,<script>alert(1)</script>")).toBe("/");
    });
  });

  describe("generateOAuthState", () => {
    test("returns state, codeChallenge, and nonce", async () => {
      vi.mocked(redis.setex).mockResolvedValue("OK");

      const result = await generateOAuthState();

      expect(result).toHaveProperty("state");
      expect(result).toHaveProperty("codeChallenge");
      expect(result).toHaveProperty("nonce");
      expect(result.state).toMatch(/^[a-f0-9]{64}$/);
    });

    test("stores state with codeVerifier and nonce in Redis with 10-minute TTL", async () => {
      vi.mocked(redis.setex).mockResolvedValue("OK");

      const result = await generateOAuthState();

      expect(redis.setex).toHaveBeenCalledWith(
        `oauth_state:${result.state}`,
        600,
        expect.any(String),
      );

      const storedData = JSON.parse(
        vi.mocked(redis.setex).mock.calls[0][2] as string,
      );
      expect(storedData.codeVerifier).toBeDefined();
      expect(storedData.nonce).toBe(result.nonce);
    });

    test("includes redirectTo in state data when provided", async () => {
      vi.mocked(redis.setex).mockResolvedValue("OK");

      await generateOAuthState("/buckets");

      const storedData = JSON.parse(
        vi.mocked(redis.setex).mock.calls[0][2] as string,
      );
      expect(storedData.redirectTo).toBe("/buckets");
    });

    test("codeChallenge matches S256 of stored codeVerifier", async () => {
      vi.mocked(redis.setex).mockResolvedValue("OK");

      const result = await generateOAuthState();

      const storedData = JSON.parse(
        vi.mocked(redis.setex).mock.calls[0][2] as string,
      );
      const expectedChallenge = generateCodeChallenge(
        storedData.codeVerifier,
      );
      expect(result.codeChallenge).toBe(expectedChallenge);
    });

    test("generates unique states on each call", async () => {
      vi.mocked(redis.setex).mockResolvedValue("OK");

      const result1 = await generateOAuthState();
      const result2 = await generateOAuthState();

      expect(result1.state).not.toBe(result2.state);
    });
  });

  describe("validateOAuthState", () => {
    const validStateData = {
      state: "abc123",
      redirectTo: "/dashboard",
      createdAt: Date.now(),
      codeVerifier: "test-verifier",
      nonce: "test-nonce",
    };

    test("returns state data for valid state using atomic GETDEL", async () => {
      vi.mocked(redis.getdel).mockResolvedValue(
        JSON.stringify(validStateData),
      );

      const result = await validateOAuthState("abc123");

      expect(result).toEqual(validStateData);
      expect(redis.getdel).toHaveBeenCalledWith("oauth_state:abc123");
    });

    test("returns null for non-existent state", async () => {
      vi.mocked(redis.getdel).mockResolvedValue(null);

      const result = await validateOAuthState("nonexistent");

      expect(result).toBeNull();
    });

    test("returns null for invalid JSON in Redis", async () => {
      vi.mocked(redis.getdel).mockResolvedValue("invalid json{");
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const result = await validateOAuthState("corrupted");

      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith(
        "Failed to parse OAuth state:",
        expect.any(Error),
      );
      consoleSpy.mockRestore();
    });

    test("uses correct Redis key prefix", async () => {
      vi.mocked(redis.getdel).mockResolvedValue(null);

      await validateOAuthState("mystate");

      expect(redis.getdel).toHaveBeenCalledWith("oauth_state:mystate");
    });
  });
});
