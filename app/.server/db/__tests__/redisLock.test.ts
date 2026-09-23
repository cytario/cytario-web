import { beforeEach, describe, expect, test, vi } from "vitest";

const redisMock = vi.hoisted(() => ({
  set: vi.fn(),
  eval: vi.fn(),
}));
vi.mock("../redis", () => ({ redis: redisMock }));

import { withRedisLock } from "../redisLock";

beforeEach(() => {
  vi.clearAllMocks();
  redisMock.set.mockReset().mockResolvedValue("OK");
  redisMock.eval.mockReset().mockResolvedValue(1);
});

describe("withRedisLock (SDS-CY-080402)", () => {
  test("runs the critical section and releases the lock", async () => {
    const result = await withRedisLock("k", async () => "value");

    expect(result).toBe("value");
    expect(redisMock.set).toHaveBeenCalledWith("k", expect.any(String), "EX", 15, "NX");
    expect(redisMock.eval).toHaveBeenCalledTimes(1);
  });

  test("releases the lock even when the critical section throws", async () => {
    await expect(
      withRedisLock("k", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    expect(redisMock.eval).toHaveBeenCalledTimes(1);
  });

  test("defaults are unchanged for an existing caller that passes no options", async () => {
    redisMock.set.mockResolvedValue(null);
    // 10 attempts at 100 ms would take a second; assert the attempt count only.
    await expect(withRedisLock("k", async () => "x")).rejects.toThrow("maximum retries");

    expect(redisMock.set).toHaveBeenCalledTimes(10);
  });

  test("a caller may widen the budget for a slower critical section", async () => {
    redisMock.set.mockResolvedValueOnce(null).mockResolvedValueOnce("OK");

    const result = await withRedisLock("k", async () => "value", {
      ttlSeconds: 30,
      maxRetries: 3,
      retryDelayMs: 1,
    });

    expect(result).toBe("value");
    expect(redisMock.set).toHaveBeenNthCalledWith(1, "k", expect.any(String), "EX", 30, "NX");
    expect(redisMock.set).toHaveBeenCalledTimes(2);
  });
});
