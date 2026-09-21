import { beforeEach, describe, expect, test, vi } from "vitest";

const resolveBatchAccessTokenMock = vi.hoisted(() => vi.fn());
vi.mock("../jobCredentialStore", () => ({
  resolveBatchAccessToken: resolveBatchAccessTokenMock,
}));

import { keepAliveGrant } from "../keepAliveGrant";
import { prisma } from "~/.server/db/prisma";

beforeEach(() => {
  vi.clearAllMocks();
  resolveBatchAccessTokenMock.mockReset();
  resolveBatchAccessTokenMock.mockResolvedValue("fresh-access-token");
  vi.spyOn(prisma.jobGrantCredential, "findUnique").mockResolvedValue({
    batchId: "batch-1",
  } as never);
});

describe("keepAliveGrant (SRS-CY-416104, SDS-CY-080901)", () => {
  test("refreshes the batch's held credentials for the session", async () => {
    await expect(keepAliveGrant("sess-batch-1")).resolves.toBeUndefined();

    // The reconciler addresses the grant by session; the batch comes off the record.
    expect(prisma.jobGrantCredential.findUnique).toHaveBeenCalledWith({
      where: { offlineSessionId: "sess-batch-1" },
      select: { batchId: true },
    });
    expect(resolveBatchAccessTokenMock).toHaveBeenCalledTimes(1);
    expect(resolveBatchAccessTokenMock).toHaveBeenCalledWith("batch-1", { force: true });
  });

  test("no-ops on an empty offlineSessionId without touching the record", async () => {
    await expect(keepAliveGrant("")).resolves.toBeUndefined();

    expect(resolveBatchAccessTokenMock).not.toHaveBeenCalled();
  });

  test("no-ops with a warn log when the refresh fails (revoked session) — never resurrects", async () => {
    resolveBatchAccessTokenMock.mockRejectedValueOnce(new Error("invalid_grant"));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(keepAliveGrant("sess-batch-1")).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toContain("sess-batch-1");
    warnSpy.mockRestore();
  });
});
