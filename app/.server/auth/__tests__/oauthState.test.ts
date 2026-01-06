import { redis } from "../../db/redis";
import { generateOAuthState, validateOAuthState } from "../oauthState";

vi.mock("../../db/redis", () => ({
  redis: {
    setex: vi.fn(),
    get: vi.fn(),
    del: vi.fn(),
  },
}));

describe("oauthState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("generateOAuthState", () => {
    test("generates random hex state string", async () => {
      vi.mocked(redis.setex).mockResolvedValue("OK");

      const state = await generateOAuthState();

      expect(state).toMatch(/^[a-f0-9]{64}$/); // 32 bytes = 64 hex chars
    });

    test("stores state in Redis with 10-minute TTL", async () => {
      vi.mocked(redis.setex).mockResolvedValue("OK");

      const state = await generateOAuthState();

      expect(redis.setex).toHaveBeenCalledWith(
        `oauth_state:${state}`,
        600, // 10 minutes in seconds
        expect.any(String)
      );
    });

    test("includes redirectTo in state data when provided", async () => {
      vi.mocked(redis.setex).mockResolvedValue("OK");

      await generateOAuthState("/buckets");

      const setexCall = vi.mocked(redis.setex).mock.calls[0];
      const storedData = JSON.parse(setexCall[2] as string);

      expect(storedData.redirectTo).toBe("/buckets");
    });

    test("includes state and createdAt in stored data", async () => {
      vi.mocked(redis.setex).mockResolvedValue("OK");
      const beforeTime = Date.now();

      const state = await generateOAuthState();

      const setexCall = vi.mocked(redis.setex).mock.calls[0];
      const storedData = JSON.parse(setexCall[2] as string);

      expect(storedData.state).toBe(state);
      expect(storedData.createdAt).toBeGreaterThanOrEqual(beforeTime);
      expect(storedData.createdAt).toBeLessThanOrEqual(Date.now());
    });

    test("generates unique states on each call", async () => {
      vi.mocked(redis.setex).mockResolvedValue("OK");

      const state1 = await generateOAuthState();
      const state2 = await generateOAuthState();

      expect(state1).not.toBe(state2);
    });
  });

  describe("validateOAuthState", () => {
    const validStateData = {
      state: "abc123",
      redirectTo: "/dashboard",
      createdAt: Date.now(),
    };

    test("returns state data for valid state", async () => {
      vi.mocked(redis.get).mockResolvedValue(JSON.stringify(validStateData));
      vi.mocked(redis.del).mockResolvedValue(1);

      const result = await validateOAuthState("abc123");

      expect(result).toEqual(validStateData);
    });

    test("deletes state after validation (one-time use)", async () => {
      vi.mocked(redis.get).mockResolvedValue(JSON.stringify(validStateData));
      vi.mocked(redis.del).mockResolvedValue(1);

      await validateOAuthState("abc123");

      expect(redis.del).toHaveBeenCalledWith("oauth_state:abc123");
    });

    test("returns null for non-existent state", async () => {
      vi.mocked(redis.get).mockResolvedValue(null);

      const result = await validateOAuthState("nonexistent");

      expect(result).toBeNull();
      expect(redis.del).not.toHaveBeenCalled();
    });

    test("returns null for invalid JSON in Redis", async () => {
      vi.mocked(redis.get).mockResolvedValue("invalid json{");
      vi.mocked(redis.del).mockResolvedValue(1);
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const result = await validateOAuthState("corrupted");

      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith(
        "Failed to parse OAuth state:",
        expect.any(Error)
      );
      consoleSpy.mockRestore();
    });

    test("uses correct Redis key prefix", async () => {
      vi.mocked(redis.get).mockResolvedValue(null);

      await validateOAuthState("mystate");

      expect(redis.get).toHaveBeenCalledWith("oauth_state:mystate");
    });
  });
});
