import { beforeEach, describe, expect, test, vi } from "vitest";

import { prisma } from "~/.server/db/prisma";
import { action } from "~/routes/api/broker";

const verifyJobTokenMock = vi.hoisted(() => vi.fn());
vi.mock("~/.server/auth/verifyJobToken", () => ({
  verifyJobToken: verifyJobTokenMock,
}));

const refreshJobTokenWithLockMock = vi.hoisted(() => vi.fn());
vi.mock("~/.server/auth/refreshJobTokenWithLock", () => ({
  refreshJobTokenWithLock: refreshJobTokenWithLockMock,
}));

const stsSendMock = vi.hoisted(() => vi.fn());
vi.mock("@aws-sdk/client-sts", () => ({
  STSClient: class {
    send = stsSendMock;
  },
  AssumeRoleWithWebIdentityCommand: class {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  },
}));

const VALID_TOKEN_PAYLOAD = {
  sub: "submitting-user-42",
  organization: { testcorp: { id: "org-1", groups: [] } },
};

const MULTI_ORG_TOKEN_PAYLOAD = {
  sub: "submitting-user-42",
  organization: {
    "cosmo-bio": { id: "org-1", groups: [] },
    cytario: { id: "org-2", groups: [] },
  },
};

const REFRESHED_ACCESS_TOKEN = "fresh-access-token";
const ROTATED_REFRESH_TOKEN = "rotated-refresh-token";

function buildRequest(body: unknown): Request {
  return new Request("http://localhost/api/broker", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const args = (request: Request) => ({ request, params: {}, context: new Map() }) as never;

/**
 * Mocks `findFirst` with the row only when the row satisfies the query's
 * WHERE clause — the tenant filters (jobId, owner, org membership) live in
 * the query, so a row outside them must resolve to no row at all.
 */
function findFirstMatchingWhere(row: Record<string, unknown> | null) {
  return async (query: unknown): Promise<Record<string, unknown> | null> => {
    if (!row) return null;
    const where = (query as { where?: Record<string, unknown> }).where ?? {};
    if (where.jobId !== undefined && where.jobId !== row.jobId) return null;
    if (where.owner !== undefined && where.owner !== row.owner) return null;
    const organization = where.organization as { in?: string[] } | undefined;
    if (organization?.in && !organization.in.includes(row.organization as string)) return null;
    return row;
  };
}

const LEDGER_ROW = {
  jobId: "job-1",
  offlineSessionId: "sess-1",
  organization: "testcorp",
  owner: "submitting-user-42",
  inputS3Uris: ["s3://data-bucket/cases/case1/"],
  outputS3Uri: "s3://data-bucket/results/run42/",
  connectionId: "c1",
  roleArn: "arn:aws:iam::123:role/storage",
  region: "eu-central-1",
  s3Endpoint: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  verifyJobTokenMock.mockReset();
  refreshJobTokenWithLockMock.mockReset();
  stsSendMock.mockReset();
  // Default: refresh succeeds and returns a fresh access token + a rotated
  // refresh token. Individual tests override as needed.
  refreshJobTokenWithLockMock.mockResolvedValue({
    accessToken: REFRESHED_ACCESS_TOKEN,
    newRefreshToken: ROTATED_REFRESH_TOKEN,
  });
});

describe("POST /api/broker (SRS-CY-416102, SDS-CY-080400)", () => {
  test("returns 400 when the body is missing token or jobId", async () => {
    const response = (await action(args(buildRequest({ token: "tok" })))) as Response;
    expect(response.status).toBe(400);
  });

  test("returns 401 when the refresh fails (grant expired or revoked)", async () => {
    refreshJobTokenWithLockMock.mockRejectedValueOnce(new Error("refresh failed"));
    const response = (await action(
      args(buildRequest({ token: "stale-refresh-token", jobId: "job-1" })),
    )) as Response;
    expect(response.status).toBe(401);
    expect((await response.json()) as { error: string }).toMatchObject({
      error: /expired or revoked/i,
    });
    // Verify is never reached when refresh fails.
    expect(verifyJobTokenMock).not.toHaveBeenCalled();
  });

  test("returns 401 when the refreshed token fails verification", async () => {
    verifyJobTokenMock.mockResolvedValueOnce(null);
    const response = (await action(
      args(buildRequest({ token: "refresh-token", jobId: "job-1" })),
    )) as Response;
    expect(response.status).toBe(401);
    expect((await response.json()) as { error: string }).toMatchObject({
      error: /failed verification/i,
    });
  });

  test("returns 403 when no ledger row exists", async () => {
    verifyJobTokenMock.mockResolvedValueOnce(VALID_TOKEN_PAYLOAD);
    vi.spyOn(prisma.jobLedgerEntry, "findFirst").mockResolvedValueOnce(null);
    const response = (await action(
      args(buildRequest({ token: "tok", jobId: "job-1" })),
    )) as Response;
    expect(response.status).toBe(403);
    expect((await response.json()) as { error: string }).toMatchObject({
      error: /no active job binding/i,
    });
  });

  test("returns 403 when the token has no organization claim at all", async () => {
    verifyJobTokenMock.mockResolvedValueOnce({ sub: "submitting-user-42" });
    const response = (await action(
      args(buildRequest({ token: "tok", jobId: "job-1" })),
    )) as Response;
    expect(response.status).toBe(403);
    expect((await response.json()) as { error: string }).toMatchObject({
      error: /organization missing from token claims/i,
    });
  });

  test("mints for a multi-org token whose ledger row's org is among the claim keys", async () => {
    verifyJobTokenMock.mockResolvedValueOnce(MULTI_ORG_TOKEN_PAYLOAD);
    const multiOrgRow = { ...LEDGER_ROW, organization: "cosmo-bio" };
    vi.spyOn(prisma.jobLedgerEntry, "findFirst").mockResolvedValueOnce(multiOrgRow as never);
    stsSendMock.mockResolvedValueOnce({
      Credentials: {
        AccessKeyId: "AKIA",
        SecretAccessKey: "secret",
        SessionToken: "token",
        Expiration: new Date("2026-01-01T12:00:00Z"),
      },
    });

    const response = (await action(
      args(buildRequest({ token: "tok", jobId: "job-1" })),
    )) as Response;
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, string>;
    expect(body.accessKeyId).toBe("AKIA");
    expect(body.refreshToken).toBe(ROTATED_REFRESH_TOKEN);
  });

  test("returns 403 when the ledger row's org is not among the token's org keys", async () => {
    verifyJobTokenMock.mockResolvedValueOnce(VALID_TOKEN_PAYLOAD);
    vi.spyOn(prisma.jobLedgerEntry, "findFirst").mockImplementationOnce(
      findFirstMatchingWhere({ ...LEDGER_ROW, organization: "other-corp" }) as never,
    );
    const response = (await action(
      args(buildRequest({ token: "tok", jobId: "job-1" })),
    )) as Response;
    expect(response.status).toBe(403);
    expect((await response.json()) as { error: string }).toMatchObject({
      error: /no active job binding/i,
    });
    expect(stsSendMock).not.toHaveBeenCalled();
  });

  test("returns 403 when the ledger row belongs to a different user", async () => {
    verifyJobTokenMock.mockResolvedValueOnce(VALID_TOKEN_PAYLOAD);
    vi.spyOn(prisma.jobLedgerEntry, "findFirst").mockImplementationOnce(
      findFirstMatchingWhere({ ...LEDGER_ROW, owner: "someone-else" }) as never,
    );
    const response = (await action(
      args(buildRequest({ token: "tok", jobId: "job-1" })),
    )) as Response;
    expect(response.status).toBe(403);
    expect((await response.json()) as { error: string }).toMatchObject({
      error: /no active job binding/i,
    });
    expect(stsSendMock).not.toHaveBeenCalled();
  });

  test("looks up the ledger row by jobId, owner, and org membership in the WHERE clause", async () => {
    verifyJobTokenMock.mockResolvedValueOnce(MULTI_ORG_TOKEN_PAYLOAD);
    const findFirst = vi
      .spyOn(prisma.jobLedgerEntry, "findFirst")
      .mockResolvedValueOnce({ ...LEDGER_ROW, organization: "cosmo-bio" } as never);
    stsSendMock.mockResolvedValueOnce({
      Credentials: {
        AccessKeyId: "AKIA",
        SecretAccessKey: "secret",
        SessionToken: "token",
        Expiration: new Date("2026-01-01T12:00:00Z"),
      },
    });

    await action(args(buildRequest({ token: "tok", jobId: "job-1" })));

    expect(findFirst).toHaveBeenCalledWith({
      where: {
        jobId: "job-1",
        owner: "submitting-user-42",
        organization: { in: ["cosmo-bio", "cytario"] },
      },
    });
  });

  test("mints non-empty creds from the ledger row — no catalog call, no connection query", async () => {
    verifyJobTokenMock.mockResolvedValueOnce(VALID_TOKEN_PAYLOAD);
    vi.spyOn(prisma.jobLedgerEntry, "findFirst").mockResolvedValueOnce(LEDGER_ROW as never);
    stsSendMock.mockResolvedValueOnce({
      Credentials: {
        AccessKeyId: "AKIA",
        SecretAccessKey: "secret",
        SessionToken: "token",
        Expiration: new Date("2026-01-01T12:00:00Z"),
      },
    });

    const response = (await action(
      args(buildRequest({ token: "tok", jobId: "job-1" })),
    )) as Response;
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, string>;
    expect(body.accessKeyId).toBe("AKIA");
    expect(body.secretAccessKey).toBe("secret");
    expect(body.sessionToken).toBe("token");
    expect(body.expiration).toBeDefined();
    // The rotated refresh token is returned for the container's next mint.
    expect(body.refreshToken).toBe(ROTATED_REFRESH_TOKEN);
  });

  test("refreshes the token with the body's refresh token, not the access token", async () => {
    verifyJobTokenMock.mockResolvedValueOnce(VALID_TOKEN_PAYLOAD);
    vi.spyOn(prisma.jobLedgerEntry, "findFirst").mockResolvedValueOnce(LEDGER_ROW as never);
    stsSendMock.mockResolvedValueOnce({
      Credentials: {
        AccessKeyId: "AKIA",
        SecretAccessKey: "secret",
        SessionToken: "token",
        Expiration: new Date("2026-01-01T12:00:00Z"),
      },
    });

    await action(args(buildRequest({ token: "container-refresh-token", jobId: "job-1" })));

    expect(refreshJobTokenWithLockMock).toHaveBeenCalledWith("container-refresh-token");
  });

  test("passes the refreshed access token to verifyJobToken, not the body token", async () => {
    verifyJobTokenMock.mockResolvedValueOnce(VALID_TOKEN_PAYLOAD);
    vi.spyOn(prisma.jobLedgerEntry, "findFirst").mockResolvedValueOnce(LEDGER_ROW as never);
    stsSendMock.mockResolvedValueOnce({
      Credentials: {
        AccessKeyId: "AKIA",
        SecretAccessKey: "secret",
        SessionToken: "token",
        Expiration: new Date("2026-01-01T12:00:00Z"),
      },
    });

    await action(args(buildRequest({ token: "container-refresh-token", jobId: "job-1" })));

    expect(verifyJobTokenMock).toHaveBeenCalledWith(REFRESHED_ACCESS_TOKEN);
  });

  test("passes the refreshed access token to STS as WebIdentityToken, not the body token", async () => {
    verifyJobTokenMock.mockResolvedValueOnce(VALID_TOKEN_PAYLOAD);
    vi.spyOn(prisma.jobLedgerEntry, "findFirst").mockResolvedValueOnce(LEDGER_ROW as never);
    stsSendMock.mockResolvedValueOnce({
      Credentials: {
        AccessKeyId: "AKIA",
        SecretAccessKey: "secret",
        SessionToken: "token",
        Expiration: new Date("2026-01-01T12:00:00Z"),
      },
    });

    await action(args(buildRequest({ token: "container-refresh-token", jobId: "job-1" })));

    const sentCommand = stsSendMock.mock.calls[0]?.[0];
    expect(sentCommand.input.WebIdentityToken).toBe(REFRESHED_ACCESS_TOKEN);
  });

  test("STS call uses roleArn and region from the ledger row", async () => {
    verifyJobTokenMock.mockResolvedValueOnce(VALID_TOKEN_PAYLOAD);
    vi.spyOn(prisma.jobLedgerEntry, "findFirst").mockResolvedValueOnce(LEDGER_ROW as never);
    stsSendMock.mockResolvedValueOnce({
      Credentials: {
        AccessKeyId: "AKIA",
        SecretAccessKey: "secret",
        SessionToken: "token",
        Expiration: new Date("2026-01-01T12:00:00Z"),
      },
    });

    await action(args(buildRequest({ token: "tok", jobId: "job-1" })));

    const sentCommand = stsSendMock.mock.calls[0]?.[0];
    expect(sentCommand.input.RoleArn).toBe("arn:aws:iam::123:role/storage");
  });

  test("session policy is scoped to the ledger-recorded targets", async () => {
    verifyJobTokenMock.mockResolvedValueOnce(VALID_TOKEN_PAYLOAD);
    vi.spyOn(prisma.jobLedgerEntry, "findFirst").mockResolvedValueOnce(LEDGER_ROW as never);
    stsSendMock.mockResolvedValueOnce({
      Credentials: {
        AccessKeyId: "AKIA",
        SecretAccessKey: "secret",
        SessionToken: "token",
        Expiration: new Date("2026-01-01T12:00:00Z"),
      },
    });

    await action(args(buildRequest({ token: "tok", jobId: "job-1" })));

    const sentCommand = stsSendMock.mock.calls[0]?.[0];
    expect(sentCommand.input.Policy).toBeDefined();
    expect(sentCommand.input.Policy).toContain("s3:PutObject");
    expect(sentCommand.input.Policy).toContain("results/run42/*");
    expect(sentCommand.input.Policy).toContain("s3:GetObject");
    expect(sentCommand.input.Policy).toContain("cases/case1/*");
  });

  test("mints without session policy when outputS3Uri is empty (legacy row)", async () => {
    verifyJobTokenMock.mockResolvedValueOnce(VALID_TOKEN_PAYLOAD);
    vi.spyOn(prisma.jobLedgerEntry, "findFirst").mockResolvedValueOnce({
      ...LEDGER_ROW,
      inputS3Uris: [],
      outputS3Uri: "",
    } as never);
    stsSendMock.mockResolvedValueOnce({
      Credentials: {
        AccessKeyId: "AKIA",
        SecretAccessKey: "secret",
        SessionToken: "token",
        Expiration: new Date("2026-01-01T12:00:00Z"),
      },
    });

    const response = (await action(
      args(buildRequest({ token: "tok", jobId: "job-1" })),
    )) as Response;
    expect(response.status).toBe(200);
    const sentCommand = stsSendMock.mock.calls[0]?.[0];
    expect(sentCommand.input.Policy).toBeUndefined();
  });

  test("returns 403 when roleArn is empty (job predates role recording)", async () => {
    verifyJobTokenMock.mockResolvedValueOnce(VALID_TOKEN_PAYLOAD);
    vi.spyOn(prisma.jobLedgerEntry, "findFirst").mockResolvedValueOnce({
      ...LEDGER_ROW,
      roleArn: "",
    } as never);

    const response = (await action(
      args(buildRequest({ token: "tok", jobId: "job-1" })),
    )) as Response;
    expect(response.status).toBe(403);
    expect((await response.json()) as { error: string }).toMatchObject({
      error: /predates role recording/i,
    });
  });

  test("logs the underlying error on a denial", async () => {
    verifyJobTokenMock.mockResolvedValueOnce(VALID_TOKEN_PAYLOAD);
    vi.spyOn(prisma.jobLedgerEntry, "findFirst").mockResolvedValueOnce(LEDGER_ROW as never);
    stsSendMock.mockRejectedValueOnce(new Error("STS is down"));

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = (await action(
      args(buildRequest({ token: "tok", jobId: "job-1" })),
    )) as Response;
    expect(response.status).toBe(403);
    expect(errorSpy).toHaveBeenCalled();
    expect(errorSpy.mock.calls[0]?.[1]).toContain("STS is down");
    errorSpy.mockRestore();
  });
});
