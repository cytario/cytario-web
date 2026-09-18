import { beforeEach, describe, expect, test, vi } from "vitest";

const redisMock = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  eval: vi.fn(),
}));
vi.mock("../../db/redis", () => ({ redis: redisMock }));

const refreshJobTokenWithLockMock = vi.hoisted(() => vi.fn());
vi.mock("../refreshJobTokenWithLock", () => ({
  refreshJobTokenWithLock: refreshJobTokenWithLockMock,
}));

import { keepAliveGrant } from "../keepAliveGrant";

const CANONICAL_RT = "canonical-refresh-token";
const ROTATED_RT = "rotated-refresh-token";

beforeEach(() => {
  vi.clearAllMocks();
  redisMock.get.mockResolvedValue(null);
  refreshJobTokenWithLockMock.mockReset();
});

describe("keepAliveGrant (SRS-CY-416104, SDS-CY-080901)", () => {
  test("refreshes the canonical token from the broker store under the existing lock", async () => {
    redisMock.get.mockResolvedValue(CANONICAL_RT);
    refreshJobTokenWithLockMock.mockResolvedValue({
      accessToken: "fresh-access",
      newRefreshToken: ROTATED_RT,
    });

    await expect(keepAliveGrant("sess-batch-1")).resolves.toBeUndefined();

    expect(redisMock.get).toHaveBeenCalledWith("broker_rt:sess-batch-1");
    expect(refreshJobTokenWithLockMock).toHaveBeenCalledTimes(1);
    expect(refreshJobTokenWithLockMock).toHaveBeenCalledWith(CANONICAL_RT);
  });

  test("no-ops when the store has no canonical token (never-minted session)", async () => {
    await expect(keepAliveGrant("sess-batch-1")).resolves.toBeUndefined();

    expect(refreshJobTokenWithLockMock).not.toHaveBeenCalled();
  });

  test("no-ops on an empty offlineSessionId without touching the store", async () => {
    await expect(keepAliveGrant("")).resolves.toBeUndefined();

    expect(redisMock.get).not.toHaveBeenCalled();
    expect(refreshJobTokenWithLockMock).not.toHaveBeenCalled();
  });

  test("no-ops with a warn log when the refresh fails (revoked session) — never resurrects", async () => {
    redisMock.get.mockResolvedValue(CANONICAL_RT);
    refreshJobTokenWithLockMock.mockRejectedValueOnce(new Error("invalid_grant"));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(keepAliveGrant("sess-batch-1")).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toContain("sess-batch-1");
    warnSpy.mockRestore();
  });

  test("warns and no-ops when the store lookup itself fails (never throws)", async () => {
    redisMock.get.mockRejectedValueOnce(new Error("redis down"));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(keepAliveGrant("sess-batch-1")).resolves.toBeUndefined();

    expect(refreshJobTokenWithLockMock).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });
});
