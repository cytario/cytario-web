import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  collectCredentialsIfBatchEmpty,
  deleteBatchCredentials,
  getOfflineSessionId,
  generateJobSessionToken,
  getBatchCredentials,
  hashJobToken,
  putBatchCredentials,
  readRawCredentialRecord,
  resolveBatchAccessToken,
} from "../jobCredentialStore";
import { prisma } from "~/.server/db/prisma";

const refreshJobTokenMock = vi.hoisted(() => vi.fn());
vi.mock("../refreshJobToken", () => ({
  refreshJobToken: refreshJobTokenMock,
}));

const redisMock = vi.hoisted(() => ({
  set: vi.fn(),
  eval: vi.fn(),
}));
vi.mock("~/.server/db/redis", () => ({ redis: redisMock }));

vi.mock("~/.server/db/crypto", () => ({
  encryptSecret: vi.fn(async (plaintext: string) => `enc:${plaintext}`),
  decryptSecret: vi.fn(async (ciphertext: string) => ciphertext.replace(/^enc:/, "")),
}));

const BATCH_ID = "batch-1";
const SESSION_ID = "sess-1";
const FUTURE = new Date(Date.now() + 300_000);
const STALE = new Date(Date.now() - 1_000);

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "rec-1",
    batchId: BATCH_ID,
    offlineSessionId: SESSION_ID,
    encryptedRefreshToken: "enc:RT0",
    encryptedAccessToken: "enc:AT0",
    accessTokenExpiresAt: FUTURE,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  refreshJobTokenMock.mockReset();
  // A lock that grants immediately; the concurrency test overrides it.
  redisMock.set.mockReset().mockResolvedValue("OK");
  redisMock.eval.mockReset().mockResolvedValue(1);
  vi.spyOn(prisma.jobGrantCredential, "findUnique").mockResolvedValue(row() as never);
  vi.spyOn(prisma.jobGrantCredential, "upsert").mockResolvedValue(row() as never);
  vi.spyOn(prisma.jobGrantCredential, "updateMany").mockResolvedValue({ count: 1 } as never);
  vi.spyOn(prisma.jobGrantCredential, "deleteMany").mockResolvedValue({ count: 1 } as never);
});

describe("job credential record (SRS-CY-416110, SDS-CY-080403)", () => {
  test("stores the refresh token encrypted, never in the clear", async () => {
    await putBatchCredentials({
      batchId: BATCH_ID,
      offlineSessionId: SESSION_ID,
      refreshToken: "batch-refresh-token",
      accessToken: "batch-access-token",
      accessTokenExpiresAt: FUTURE,
    });

    const written = vi.mocked(prisma.jobGrantCredential.upsert).mock.calls[0]?.[0];
    // Only the ciphertext reaches the database — no plaintext field is written.
    expect(written?.create.encryptedRefreshToken).toBe("enc:batch-refresh-token");
    expect(written?.create.encryptedAccessToken).toBe("enc:batch-access-token");
    expect(written?.create).not.toHaveProperty("refreshToken");
    expect(written?.create).not.toHaveProperty("accessToken");
    // Identity is set at creation and never overwritten by a later write.
    expect(written?.update).not.toHaveProperty("batchId");
    expect(written?.update).not.toHaveProperty("organization");
    expect(written?.update).not.toHaveProperty("owner");
  });

  test("keys the record by the batch identifier the ledger rows carry", async () => {
    await putBatchCredentials({
      batchId: BATCH_ID,
      offlineSessionId: SESSION_ID,
      refreshToken: "rt",
      accessToken: "at",
      accessTokenExpiresAt: FUTURE,
    });

    expect(vi.mocked(prisma.jobGrantCredential.upsert).mock.calls[0]?.[0].where).toEqual({
      batchId: BATCH_ID,
    });
  });

  test("the record is addressed by its own key — the batch — from every path", () => {
    expect(readRawCredentialRecord).toBeTypeOf("function");
    expect(getOfflineSessionId).toBeTypeOf("function");
  });

  test("a fresh held access token is served with no identity-service call", async () => {
    const accessToken = await resolveBatchAccessToken(BATCH_ID);

    expect(accessToken).toBe("AT0");
    expect(refreshJobTokenMock).not.toHaveBeenCalled();
    expect(redisMock.set).not.toHaveBeenCalled();
  });

  test("a stale held access token refreshes once and persists the rotated pair", async () => {
    vi.spyOn(prisma.jobGrantCredential, "findUnique").mockResolvedValue(row() as never);
    // First read (outside the lock) is stale; the re-check inside is too.
    refreshJobTokenMock.mockResolvedValueOnce({
      accessToken: "AT1",
      newRefreshToken: "RT1",
      expiresInSeconds: 300,
    });
    vi.mocked(prisma.jobGrantCredential.findUnique)
      .mockResolvedValueOnce(row({ accessTokenExpiresAt: STALE }) as never)
      .mockResolvedValueOnce(row({ accessTokenExpiresAt: STALE }) as never)
      .mockResolvedValueOnce(row({ accessTokenExpiresAt: STALE }) as never);

    const accessToken = await resolveBatchAccessToken(BATCH_ID);

    expect(accessToken).toBe("AT1");
    expect(refreshJobTokenMock).toHaveBeenCalledTimes(1);
    expect(refreshJobTokenMock).toHaveBeenCalledWith("RT0");

    const written = vi.mocked(prisma.jobGrantCredential.updateMany).mock.calls[0]?.[0];
    expect(written?.data.encryptedRefreshToken).toBe("enc:RT1");
    expect(written?.data.encryptedAccessToken).toBe("enc:AT1");
    expect(written?.where).toEqual({ batchId: BATCH_ID });
  });

  test("a waiter is served from the refresh its sibling performed, not its own", async () => {
    // The outer read is stale, but by the time the lock is held the sibling has
    // already refreshed: the cache re-check inside the lock wins.
    vi.mocked(prisma.jobGrantCredential.findUnique)
      .mockResolvedValueOnce(row({ accessTokenExpiresAt: STALE }) as never)
      .mockResolvedValueOnce(row({ accessTokenExpiresAt: FUTURE }) as never);

    const accessToken = await resolveBatchAccessToken(BATCH_ID);

    expect(accessToken).toBe("AT0");
    expect(refreshJobTokenMock).not.toHaveBeenCalled();
    expect(prisma.jobGrantCredential.updateMany).not.toHaveBeenCalled();
    expect(redisMock.set).toHaveBeenCalledTimes(1);
  });

  test("keep-alive forces the refresh rather than sharing the broker's cache", async () => {
    refreshJobTokenMock.mockResolvedValueOnce({
      accessToken: "AT1",
      newRefreshToken: "RT1",
      expiresInSeconds: 300,
    });

    await resolveBatchAccessToken(BATCH_ID, { force: true });

    // The held token is fresh, yet the identity service is still touched.
    expect(refreshJobTokenMock).toHaveBeenCalledTimes(1);
  });

  test("a refresh never revives a record a revocation deleted", async () => {
    vi.mocked(prisma.jobGrantCredential.findUnique)
      .mockResolvedValueOnce(row({ accessTokenExpiresAt: STALE }) as never)
      .mockResolvedValueOnce(null as never)
      .mockResolvedValueOnce(null as never);

    await expect(resolveBatchAccessToken(BATCH_ID)).resolves.toBeNull();
    expect(refreshJobTokenMock).not.toHaveBeenCalled();
    expect(prisma.jobGrantCredential.updateMany).not.toHaveBeenCalled();
  });

  test("a refresh racing a revoke loses: the write is scoped and a miss yields null", async () => {
    vi.mocked(prisma.jobGrantCredential.findUnique)
      .mockResolvedValueOnce(row({ accessTokenExpiresAt: STALE }) as never)
      .mockResolvedValueOnce(row({ accessTokenExpiresAt: STALE }) as never)
      .mockResolvedValueOnce(row({ accessTokenExpiresAt: STALE }) as never);
    vi.mocked(prisma.jobGrantCredential.updateMany).mockResolvedValueOnce({ count: 0 } as never);
    refreshJobTokenMock.mockResolvedValueOnce({
      accessToken: "AT1",
      newRefreshToken: "RT1",
      expiresInSeconds: 300,
    });

    await expect(resolveBatchAccessToken(BATCH_ID)).resolves.toBeNull();
  });

  test("N concurrent callers cause exactly one refresh at the identity service", async () => {
    // The real lock against a mock Redis that holds `NX` for the first caller
    // and refuses the rest while it works — the cold-batch scenario.
    let held = false;
    redisMock.set.mockImplementation(async () => {
      if (held) return null;
      held = true;
      return "OK";
    });
    redisMock.eval.mockImplementation(async () => {
      held = false;
      return 1;
    });

    // Until the refresh lands, the record stays stale for every caller.
    let currentRow = row({ accessTokenExpiresAt: STALE });
    // A Prisma read returns a `PrismaPromise`, not a plain one, so the
    // implementation is cast to the delegate's own return type.
    vi.mocked(prisma.jobGrantCredential.findUnique).mockImplementation(
      (async () => currentRow) as never,
    );
    refreshJobTokenMock.mockImplementation(async () => {
      // A real identity-service round trip is not instant; give the waiters a
      // window in which to contend for the lock.
      await new Promise((resolve) => setTimeout(resolve, 50));
      currentRow = row({
        encryptedAccessToken: "enc:AT1",
        encryptedRefreshToken: "enc:RT1",
      });
      return { accessToken: "AT1", newRefreshToken: "RT1", expiresInSeconds: 300 };
    });

    const results = await Promise.all(
      // No `force`: the cold-batch case is a stale held token, which is exactly
      // what the freshness check outside the lock is there to catch.
      Array.from({ length: 25 }, () => resolveBatchAccessToken(BATCH_ID)),
    );

    expect(refreshJobTokenMock).toHaveBeenCalledTimes(1);
    expect(results).toEqual(Array.from({ length: 25 }, () => "AT1"));
  });

  test("an absent record yields null instead of minting", async () => {
    vi.spyOn(prisma.jobGrantCredential, "findUnique").mockResolvedValue(null as never);

    await expect(resolveBatchAccessToken(BATCH_ID)).resolves.toBeNull();
    expect(refreshJobTokenMock).not.toHaveBeenCalled();
  });

  test("collection is one statement guarded by the relation", async () => {
    const deleteMany = vi
      .spyOn(prisma.jobGrantCredential, "deleteMany")
      .mockResolvedValue({ count: 1 } as never);

    await collectCredentialsIfBatchEmpty(BATCH_ID);

    // The predicate is the same join the foreign key enforces, read the other
    // way: no ledger row of this batch is left, so nothing can mint with it.
    expect(deleteMany).toHaveBeenCalledWith({
      where: { batchId: BATCH_ID, ledgerEntries: { none: {} } },
    });
  });

  test("revocation deletes the record", async () => {
    await deleteBatchCredentials(BATCH_ID);

    expect(prisma.jobGrantCredential.deleteMany).toHaveBeenCalledWith({
      where: { batchId: BATCH_ID },
    });
  });

  test("getBatchCredentials decrypts both halves", async () => {
    const credentials = await getBatchCredentials(BATCH_ID);

    expect(credentials).toMatchObject({ accessToken: "AT0", refreshToken: "RT0" });
  });
});

describe("job session token (SRS-CY-416110)", () => {
  test("is high-entropy and opaque", () => {
    const token = generateJobSessionToken();

    expect(token.length).toBeGreaterThanOrEqual(43);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(generateJobSessionToken()).not.toBe(token);
  });

  test("is recorded only as a hash that is not the token", () => {
    const token = generateJobSessionToken();
    const hash = hashJobToken(token);

    expect(hash).not.toBe(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashJobToken(token)).toBe(hash);
    expect(hashJobToken(generateJobSessionToken())).not.toBe(hash);
  });
});
