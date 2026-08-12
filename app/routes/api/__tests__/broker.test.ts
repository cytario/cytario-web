import { beforeEach, describe, expect, test, vi } from "vitest";

import { prisma } from "~/.server/db/prisma";
import { action } from "~/routes/api/broker";

const verifyJobTokenMock = vi.hoisted(() => vi.fn());
vi.mock("~/.server/auth/verifyJobToken", () => ({
  verifyJobToken: verifyJobTokenMock,
}));

const getProviderCatalogMock = vi.hoisted(() => vi.fn());
const resolveConnectionProviderMock = vi.hoisted(() => vi.fn());
vi.mock("~/.server/providers/providerCatalog.server", () => ({
  getProviderCatalog: getProviderCatalogMock,
  resolveConnectionProvider: resolveConnectionProviderMock,
  invalidateProviderCatalogCache: vi.fn(),
  clearProviderCatalogCache: vi.fn(),
  findProviderConnection: vi.fn(),
  findProviderRole: vi.fn(),
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

function buildRequest(body: unknown, headers?: Record<string, string>): Request {
  return new Request("http://localhost/api/broker", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

const args = (request: Request) => ({ request, params: {}, context: new Map() }) as never;

beforeEach(() => {
  vi.clearAllMocks();
  verifyJobTokenMock.mockReset();
  getProviderCatalogMock.mockReset();
  resolveConnectionProviderMock.mockReset();
  stsSendMock.mockReset();
});

describe("POST /api/broker (SRS-CY-416102, SDS-CY-080400)", () => {
  test("returns 400 when the body is missing token or jobId", async () => {
    const response = (await action(args(buildRequest({ token: "tok" })))) as Response;
    expect(response.status).toBe(400);
  });

  test("returns 401 when the token fails verification", async () => {
    verifyJobTokenMock.mockResolvedValueOnce(null);
    const response = (await action(
      args(buildRequest({ token: "bad", jobId: "job-1" })),
    )) as Response;
    expect(response.status).toBe(401);
    expect((await response.json()) as { error: string }).toMatchObject({
      error: /failed verification/i,
    });
  });

  test("returns 403 when no ledger row exists (revoked or unknown job)", async () => {
    verifyJobTokenMock.mockResolvedValueOnce(VALID_TOKEN_PAYLOAD);
    vi.spyOn(prisma.jobLedgerEntry, "findFirst").mockResolvedValueOnce(null);
    vi.spyOn(prisma.connectionConfig, "findMany").mockResolvedValueOnce([]);
    const response = (await action(
      args(buildRequest({ token: "tok", jobId: "job-1" })),
    )) as Response;
    expect(response.status).toBe(403);
    expect((await response.json()) as { error: string }).toMatchObject({
      error: /no active job binding/i,
    });
  });

  test("returns 403 when the org has no connected storage", async () => {
    verifyJobTokenMock.mockResolvedValueOnce(VALID_TOKEN_PAYLOAD);
    vi.spyOn(prisma.jobLedgerEntry, "findFirst").mockResolvedValueOnce({
      jobId: "job-1",
      offlineSessionId: "sess-1",
      organization: "testcorp",
      owner: "user-1",
    } as never);
    vi.spyOn(prisma.connectionConfig, "findMany").mockResolvedValueOnce([]);
    const response = (await action(
      args(buildRequest({ token: "tok", jobId: "job-1" })),
    )) as Response;
    expect(response.status).toBe(403);
    expect((await response.json()) as { error: string }).toMatchObject({
      error: /no connected storage/i,
    });
  });

  test("mints non-empty creds when the ledger row exists and a connection is available", async () => {
    verifyJobTokenMock.mockResolvedValueOnce(VALID_TOKEN_PAYLOAD);
    vi.spyOn(prisma.jobLedgerEntry, "findFirst").mockResolvedValueOnce({
      jobId: "job-1",
      offlineSessionId: "sess-1",
      organization: "testcorp",
      owner: "user-1",
    } as never);
    vi.spyOn(prisma.connectionConfig, "findMany").mockResolvedValueOnce([
      {
        id: "c1",
        bucketName: "data-bucket",
        prefix: "in/",
        providerConnectionId: "pc-1",
        grants: [{ providerRoleId: "pr-1" }],
      } as never,
    ] as never);
    getProviderCatalogMock.mockResolvedValueOnce({});
    resolveConnectionProviderMock.mockReturnValueOnce({
      providerType: "aws",
      endpoint: null,
      region: "eu-central-1",
      roleArn: "arn:aws:iam::123:role/storage",
      allowedScopes: [],
      accessLevel: "read-write",
    });
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
  });

  test("validates the s3Uri against the org's connected storage", async () => {
    verifyJobTokenMock.mockResolvedValueOnce(VALID_TOKEN_PAYLOAD);
    vi.spyOn(prisma.jobLedgerEntry, "findFirst").mockResolvedValueOnce({
      jobId: "job-1",
      offlineSessionId: "sess-1",
      organization: "testcorp",
      owner: "user-1",
    } as never);
    vi.spyOn(prisma.connectionConfig, "findMany").mockResolvedValueOnce([
      {
        id: "c1",
        bucketName: "data-bucket",
        prefix: "in/",
        providerConnectionId: "pc-1",
        grants: [{ providerRoleId: "pr-1" }],
      } as never,
    ] as never);
    getProviderCatalogMock.mockResolvedValueOnce({});
    resolveConnectionProviderMock.mockReturnValueOnce({
      providerType: "aws",
      endpoint: null,
      region: "eu-central-1",
      roleArn: "arn:aws:iam::123:role/storage",
      allowedScopes: [],
      accessLevel: "read-write",
    });
    stsSendMock.mockResolvedValueOnce({
      Credentials: {
        AccessKeyId: "AKIA",
        SecretAccessKey: "secret",
        SessionToken: "token",
        Expiration: new Date("2026-01-01T12:00:00Z"),
      },
    });

    // s3Uri on a different bucket → rejected
    const response = (await action(
      args(
        buildRequest({
          token: "tok",
          jobId: "job-1",
          s3Uri: "s3://other-bucket/out/",
        }),
      ),
    )) as Response;
    expect(response.status).toBe(403);
    expect((await response.json()) as { error: string }).toMatchObject({
      error: /outside this organization's connected storage/i,
    });
  });

  test("includes a session policy when s3Uri is present", async () => {
    verifyJobTokenMock.mockResolvedValueOnce(VALID_TOKEN_PAYLOAD);
    vi.spyOn(prisma.jobLedgerEntry, "findFirst").mockResolvedValueOnce({
      jobId: "job-1",
      offlineSessionId: "sess-1",
      organization: "testcorp",
      owner: "user-1",
    } as never);
    vi.spyOn(prisma.connectionConfig, "findMany").mockResolvedValueOnce([
      {
        id: "c1",
        bucketName: "data-bucket",
        prefix: "",
        providerConnectionId: "pc-1",
        grants: [{ providerRoleId: "pr-1" }],
      } as never,
    ] as never);
    getProviderCatalogMock.mockResolvedValueOnce({});
    resolveConnectionProviderMock.mockReturnValueOnce({
      providerType: "aws",
      endpoint: null,
      region: "eu-central-1",
      roleArn: "arn:aws:iam::123:role/storage",
      allowedScopes: [],
      accessLevel: "read-write",
    });
    stsSendMock.mockResolvedValueOnce({
      Credentials: {
        AccessKeyId: "AKIA",
        SecretAccessKey: "secret",
        SessionToken: "token",
        Expiration: new Date("2026-01-01T12:00:00Z"),
      },
    });

    const response = (await action(
      args(
        buildRequest({
          token: "tok",
          jobId: "job-1",
          s3Uri: "s3://data-bucket/out/",
        }),
      ),
    )) as Response;
    expect(response.status).toBe(200);
    // The STS command should have a Policy field
    const sentCommand = stsSendMock.mock.calls[0]?.[0];
    expect(sentCommand.input.Policy).toBeDefined();
    expect(sentCommand.input.Policy).toContain("PutObjectScopedToOutputPrefix");
  });

  test("logs the underlying error on a denial (C-384)", async () => {
    verifyJobTokenMock.mockResolvedValueOnce(VALID_TOKEN_PAYLOAD);
    vi.spyOn(prisma.jobLedgerEntry, "findFirst").mockResolvedValueOnce({
      jobId: "job-1",
      offlineSessionId: "sess-1",
      organization: "testcorp",
      owner: "user-1",
    } as never);
    vi.spyOn(prisma.connectionConfig, "findMany").mockResolvedValueOnce([
      {
        id: "c1",
        bucketName: "data-bucket",
        prefix: "",
        providerConnectionId: "pc-1",
        grants: [{ providerRoleId: "pr-1" }],
      } as never,
    ] as never);
    getProviderCatalogMock.mockResolvedValueOnce({});
    resolveConnectionProviderMock.mockReturnValueOnce({
      providerType: "aws",
      endpoint: null,
      region: "eu-central-1",
      roleArn: "arn:aws:iam::123:role/storage",
      allowedScopes: [],
      accessLevel: "read-write",
    });
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
