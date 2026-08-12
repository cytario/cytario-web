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

function buildRequest(body: unknown): Request {
  return new Request("http://localhost/api/broker", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const args = (request: Request) => ({ request, params: {}, context: new Map() }) as never;

const LEDGER_ROW = {
  jobId: "job-1",
  offlineSessionId: "sess-1",
  organization: "testcorp",
  owner: "user-1",
  inputS3Uris: ["s3://data-bucket/cases/case1/"],
  outputS3Uri: "s3://data-bucket/results/run42/",
};

const CONNECTIONS = [
  {
    id: "c1",
    bucketName: "data-bucket",
    prefix: "",
    providerConnectionId: "pc-1",
    grants: [{ providerRoleId: "pr-1" }],
  },
];

const RESOLVED_PROVIDER = {
  providerType: "aws",
  endpoint: null,
  region: "eu-central-1",
  roleArn: "arn:aws:iam::123:role/storage",
  allowedScopes: [],
  accessLevel: "read-write",
};

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

  test("mints non-empty creds when the ledger row has input+output targets", async () => {
    verifyJobTokenMock.mockResolvedValueOnce(VALID_TOKEN_PAYLOAD);
    vi.spyOn(prisma.jobLedgerEntry, "findFirst").mockResolvedValueOnce(LEDGER_ROW as never);
    vi.spyOn(prisma.connectionConfig, "findMany").mockResolvedValueOnce(CONNECTIONS as never);
    getProviderCatalogMock.mockResolvedValueOnce({});
    resolveConnectionProviderMock.mockReturnValueOnce(RESOLVED_PROVIDER);
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

  test("session policy is scoped to the ledger-recorded targets, not the request", async () => {
    verifyJobTokenMock.mockResolvedValueOnce(VALID_TOKEN_PAYLOAD);
    vi.spyOn(prisma.jobLedgerEntry, "findFirst").mockResolvedValueOnce(LEDGER_ROW as never);
    vi.spyOn(prisma.connectionConfig, "findMany").mockResolvedValueOnce(CONNECTIONS as never);
    getProviderCatalogMock.mockResolvedValueOnce({});
    resolveConnectionProviderMock.mockReturnValueOnce(RESOLVED_PROVIDER);
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
    // PutObject scoped to the output prefix from the ledger, not the request
    expect(sentCommand.input.Policy).toContain("PutObjectScopedToOutput");
    expect(sentCommand.input.Policy).toContain("results/run42/*");
    // GetObject covers both input and output prefixes
    expect(sentCommand.input.Policy).toContain("GetObjectScopedToTargets");
    expect(sentCommand.input.Policy).toContain("cases/case1/*");
  });

  test("mints without session policy when outputS3Uri is empty (legacy row)", async () => {
    verifyJobTokenMock.mockResolvedValueOnce(VALID_TOKEN_PAYLOAD);
    vi.spyOn(prisma.jobLedgerEntry, "findFirst").mockResolvedValueOnce({
      ...LEDGER_ROW,
      inputS3Uris: [],
      outputS3Uri: "",
    } as never);
    vi.spyOn(prisma.connectionConfig, "findMany").mockResolvedValueOnce(CONNECTIONS as never);
    getProviderCatalogMock.mockResolvedValueOnce({});
    resolveConnectionProviderMock.mockReturnValueOnce(RESOLVED_PROVIDER);
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

  test("logs the underlying error on a denial", async () => {
    verifyJobTokenMock.mockResolvedValueOnce(VALID_TOKEN_PAYLOAD);
    vi.spyOn(prisma.jobLedgerEntry, "findFirst").mockResolvedValueOnce(LEDGER_ROW as never);
    vi.spyOn(prisma.connectionConfig, "findMany").mockResolvedValueOnce(CONNECTIONS as never);
    getProviderCatalogMock.mockResolvedValueOnce({});
    resolveConnectionProviderMock.mockReturnValueOnce(RESOLVED_PROVIDER);
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
