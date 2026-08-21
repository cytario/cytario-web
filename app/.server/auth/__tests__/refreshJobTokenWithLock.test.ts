import { beforeEach, describe, expect, test, vi } from "vitest";

const redisMock = vi.hoisted(() => ({
  set: vi.fn(),
  get: vi.fn(),
  eval: vi.fn(),
  del: vi.fn(),
}));
vi.mock("../../db/redis", () => ({ redis: redisMock }));

const refreshJobTokenMock = vi.hoisted(() => vi.fn());
vi.mock("../refreshJobToken", () => ({ refreshJobToken: refreshJobTokenMock }));

import { refreshJobTokenWithLock } from "../refreshJobTokenWithLock";

/**
 * Builds a fake Keycloak refresh-token JWT carrying `session_state` in the
 * payload (base64url-encoded). Only the payload matters for the lock-key
 * derivation; the header/signature are placeholders.
 */
function fakeRefreshToken(sessionState: string): string {
  const header = Buffer.from('{"alg":"RS256"}').toString("base64url");
  const payload = Buffer.from(JSON.stringify({ session_state: sessionState, sub: "u1" })).toString(
    "base64url",
  );
  return `${header}.${payload}.sig`;
}

const RT0 = fakeRefreshToken("sess-batch-1");
const RT1 = "rotated-rt-1";
const RT2 = "rotated-rt-2";
const ACCESS_TOKEN = "fresh-access-token";

beforeEach(() => {
  vi.clearAllMocks();
  // Default: the lock is acquired on the first SET NX, the store is
  // empty (first caller), and Keycloak returns RT1 + an access token.
  redisMock.set.mockResolvedValue("OK"); // lock acquired
  redisMock.get.mockResolvedValue(null); // no canonical token yet
  redisMock.eval.mockResolvedValue(1); // lock released
  refreshJobTokenMock.mockResolvedValue({
    accessToken: ACCESS_TOKEN,
    newRefreshToken: RT1,
  });
});

describe("refreshJobTokenWithLock (SRS-CY-416109, SDS-CY-080402)", () => {
  test("first caller: redeems the presented token, stores the rotated token, returns it", async () => {
    const result = await refreshJobTokenWithLock(RT0);

    expect(result).toEqual({ accessToken: ACCESS_TOKEN, newRefreshToken: RT1 });
    // Lock acquired with NX + EX 15s.
    expect(redisMock.set).toHaveBeenCalledWith(
      "broker_rt_lock:sess-batch-1",
      expect.any(String),
      "EX",
      15,
      "NX",
    );
    // No canonical token yet → redeem the presented RT0.
    expect(refreshJobTokenMock).toHaveBeenCalledTimes(1);
    expect(refreshJobTokenMock).toHaveBeenCalledWith(RT0);
    // Rotated token written back to the store with the 7-day TTL.
    expect(redisMock.set).toHaveBeenCalledWith("broker_rt:sess-batch-1", RT1, "EX", 604800);
    // Lock released.
    expect(redisMock.eval).toHaveBeenCalledTimes(1);
  });

  test("sibling caller with stale RT0: redeems the canonical RT1 from the store, not the stale RT0", async () => {
    // A sibling already rotated RT0→RT1 and wrote RT1 to the store.
    redisMock.get.mockResolvedValue(RT1);
    refreshJobTokenMock.mockResolvedValue({
      accessToken: ACCESS_TOKEN,
      newRefreshToken: RT2,
    });

    const result = await refreshJobTokenWithLock(RT0);

    expect(result.newRefreshToken).toBe(RT2);
    // The stale RT0 is NOT redeemed — the canonical RT1 is.
    expect(refreshJobTokenMock).toHaveBeenCalledWith(RT1);
    expect(refreshJobTokenMock).not.toHaveBeenCalledWith(RT0);
    // The newly rotated RT2 is written back.
    expect(redisMock.set).toHaveBeenCalledWith("broker_rt:sess-batch-1", RT2, "EX", 604800);
  });

  test("redeems on every call even when a canonical token is cached (no cache-hit fast path — SRS-CY-416102(a))", async () => {
    redisMock.get.mockResolvedValue(RT1); // canonical token exists
    refreshJobTokenMock.mockResolvedValue({
      accessToken: ACCESS_TOKEN,
      newRefreshToken: RT2,
    });

    await refreshJobTokenWithLock(RT0);

    // Keycloak is still called — the canonical store converges the token,
    // it never skips redemption (a revoked session must mint nothing).
    expect(refreshJobTokenMock).toHaveBeenCalledTimes(1);
    expect(refreshJobTokenMock).toHaveBeenCalledWith(RT1);
  });

  test("concurrent batch: N callers sharing one session all succeed and all redeem at Keycloak (SRS-CY-416109)", async () => {
    // Model a real Redis SET NX lock over the mock: the first caller to
    // request the lock gets "OK"; others get null (wait) until the holder
    // releases via eval. A shared `storeValue` models the canonical store.
    const N = 5;
    let storeValue: string | null = null;
    let locked = false;

    redisMock.set.mockImplementation(async (...args: unknown[]) => {
      const isLockCall = args.includes("NX");
      if (isLockCall) {
        if (locked) return null;
        locked = true;
        return "OK";
      }
      // store write (key, value, "EX", ttl)
      storeValue = args[1] as string;
      return "OK";
    });
    redisMock.get.mockImplementation(async () => storeValue);
    redisMock.eval.mockImplementation(async () => {
      locked = false;
      return 1;
    });

    let redeemCount = 0;
    refreshJobTokenMock.mockImplementation(async (token: string) => {
      redeemCount += 1;
      // Each redeem must use the canonical current token (RT0 on the first
      // call, then the rotated token from the store on subsequent calls).
      const expected = storeValue ?? RT0;
      expect(token).toBe(expected);
      const rotated = `rotated-rt-${redeemCount}`;
      return { accessToken: ACCESS_TOKEN, newRefreshToken: rotated };
    });

    const results = await Promise.all(
      Array.from({ length: N }, () => refreshJobTokenWithLock(RT0)),
    );

    // All N succeed — none is rejected with invalid_grant.
    expect(results).toHaveLength(N);
    for (const r of results) {
      expect(r.accessToken).toBe(ACCESS_TOKEN);
      expect(r.newRefreshToken).toMatch(/^rotated-rt-\d+$/);
    }
    // Every call redeemed at Keycloak — no cache-hit fast path skips
    // redemption (preserves the revocation guarantee of SRS-CY-416102(a)).
    expect(redeemCount).toBe(N);
  });

  test("writes the rotated token back BEFORE releasing the lock", async () => {
    const callOrder: string[] = [];
    refreshJobTokenMock.mockImplementation(async () => {
      callOrder.push("redeem");
      return { accessToken: ACCESS_TOKEN, newRefreshToken: RT1 };
    });
    redisMock.set.mockImplementation(async (...args: unknown[]) => {
      if (args.includes("NX")) {
        callOrder.push("lock-acquire");
        return "OK";
      }
      callOrder.push("store-write");
      return "OK";
    });
    redisMock.eval.mockImplementation(async () => {
      callOrder.push("lock-release");
      return 1;
    });

    await refreshJobTokenWithLock(RT0);

    const writeIdx = callOrder.indexOf("store-write");
    const releaseIdx = callOrder.indexOf("lock-release");
    expect(writeIdx).toBeGreaterThanOrEqual(0);
    expect(releaseIdx).toBeGreaterThanOrEqual(0);
    expect(writeIdx).toBeLessThan(releaseIdx);
  });

  test("falls back to a per-token hash key when the JWT is undecodable (no convergence, but safe)", async () => {
    const result = await refreshJobTokenWithLock("not-a-jwt");

    expect(result.newRefreshToken).toBe(RT1);
    // The lock key is NOT the session id and does NOT contain the raw token.
    const lockCall = redisMock.set.mock.calls.find((c) => c.includes("NX"));
    expect(lockCall?.[0]).toMatch(/^broker_rt_lock:hash:[0-9a-f]{64}$/);
    expect(lockCall?.[0]).not.toContain("not-a-jwt");
  });

  test("throws when the lock cannot be acquired after retries", async () => {
    redisMock.set.mockResolvedValue(null); // lock never acquired

    await expect(refreshJobTokenWithLock(RT0)).rejects.toThrow(
      /Failed to acquire broker refresh lock/,
    );
    expect(refreshJobTokenMock).not.toHaveBeenCalled();
  });

  test("propagates a Keycloak refresh failure (revoked grant) and does not write the store", async () => {
    refreshJobTokenMock.mockRejectedValueOnce(new Error("invalid_grant"));

    await expect(refreshJobTokenWithLock(RT0)).rejects.toThrow(/invalid_grant/);
    // No store write happened (the finally still releases the lock).
    const storeWrites = redisMock.set.mock.calls.filter((c) => !c.includes("NX"));
    expect(storeWrites).toHaveLength(0);
    expect(redisMock.eval).toHaveBeenCalledTimes(1); // lock released in finally
  });
});
