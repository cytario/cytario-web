import { bucketPolicyLockKey, withBucketPolicyLock } from "../bucketPolicyLock";
import { redis } from "~/.server/db/redis";

vi.mock("~/.server/db/redis", () => ({
  redis: {
    set: vi.fn(),
    eval: vi.fn(),
  },
}));

describe("bucketPolicyLockKey", () => {
  test("uses the pinned cross-repo key format", () => {
    expect(bucketPolicyLockKey("123456789012", "customer-bucket")).toBe(
      "bucketpolicy:123456789012:customer-bucket",
    );
  });
});

describe("withBucketPolicyLock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("acquires the pinned lock key with NX + TTL, runs fn, releases atomically", async () => {
    vi.mocked(redis.set).mockResolvedValue("OK");
    vi.mocked(redis.eval).mockResolvedValue(1);

    const result = await withBucketPolicyLock(
      "123456789012",
      "customer-bucket",
      async () => "done",
    );

    expect(result).toBe("done");
    expect(redis.set).toHaveBeenCalledWith(
      "bucketpolicy:123456789012:customer-bucket",
      expect.any(String),
      "EX",
      expect.any(Number),
      "NX",
    );
    // atomic check-and-delete release
    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining("redis.call"),
      1,
      "bucketpolicy:123456789012:customer-bucket",
      expect.any(String),
    );
  });

  test("releases the lock even when fn throws", async () => {
    vi.mocked(redis.set).mockResolvedValue("OK");
    vi.mocked(redis.eval).mockResolvedValue(1);

    await expect(
      withBucketPolicyLock("123456789012", "b", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    expect(redis.eval).toHaveBeenCalled();
  });

  test("throws (fails closed) when the lock can never be acquired", async () => {
    vi.mocked(redis.set).mockResolvedValue(null);

    await expect(
      withBucketPolicyLock("123456789012", "b", async () => "unreached"),
    ).rejects.toThrow(/serialize bucket-policy write/);
  });
});
