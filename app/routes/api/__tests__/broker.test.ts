import { beforeEach, describe, expect, test, vi } from "vitest";

import { action } from "~/routes/api/broker";

// The job token resolves to a ledger row server-side; nothing in the request
// body takes part, so the resolver is the seam that decides the binding.
const resolveJobBindingMock = vi.hoisted(() => vi.fn());
vi.mock("~/.server/auth/resolveJobBinding", () => ({
  resolveJobBinding: resolveJobBindingMock,
}));

vi.mock("~/.server/auth/refreshJobToken", () => ({
  JobGrantRefusedError: class JobGrantRefusedError extends Error {
    status: number;
    constructor(status: number, detail: string) {
      super(`Job token refresh refused: ${status} - ${detail}`);
      this.status = status;
    }
  },
}));

const resolveBatchAccessTokenMock = vi.hoisted(() => vi.fn());
vi.mock("~/.server/auth/jobCredentialStore", () => ({
  hashJobToken: (token: string) => `hash:${token}`,
  resolveBatchAccessToken: resolveBatchAccessTokenMock,
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

const ACCESS_TOKEN = "batch-access-token";
const PRESENTED_TOKEN = "job-session-token";

const LEDGER_ROW = {
  jobId: "job-1",
  batchId: "batch-1",
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

const BINDING = { ...LEDGER_ROW, row: LEDGER_ROW };

function buildRequest(body: unknown): Request {
  return new Request("http://localhost/api/broker", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const args = (request: Request) => ({ request, params: {}, context: new Map() }) as never;

const STS_CREDENTIALS = {
  Credentials: {
    AccessKeyId: "AKIA",
    SecretAccessKey: "secret",
    SessionToken: "token",
    Expiration: new Date("2026-01-01T12:00:00Z"),
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  resolveJobBindingMock.mockReset();
  resolveBatchAccessTokenMock.mockReset();
  stsSendMock.mockReset();

  resolveJobBindingMock.mockResolvedValue(BINDING);
  resolveBatchAccessTokenMock.mockResolvedValue(ACCESS_TOKEN);
  stsSendMock.mockResolvedValue(STS_CREDENTIALS);
});

describe("POST /api/broker (SRS-CY-416102, SRS-CY-416110, SDS-CY-080400)", () => {
  test("returns 400 when the body carries no token", async () => {
    const response = (await action(args(buildRequest({})))) as Response;
    expect(response.status).toBe(400);
    expect(resolveJobBindingMock).not.toHaveBeenCalled();
  });

  test("returns 403 when the presented token resolves to no ledger row", async () => {
    resolveJobBindingMock.mockResolvedValueOnce(null);

    const response = (await action(args(buildRequest({ token: PRESENTED_TOKEN })))) as Response;

    expect(response.status).toBe(403);
    expect((await response.json()) as { error: string }).toMatchObject({
      error: /no active job binding/i,
    });
    expect(stsSendMock).not.toHaveBeenCalled();
  });

  test("mints from the resolved row's role and targets", async () => {
    const response = (await action(args(buildRequest({ token: PRESENTED_TOKEN })))) as Response;

    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, string>;
    expect(body.accessKeyId).toBe("AKIA");
    expect(body.secretAccessKey).toBe("secret");
    expect(body.sessionToken).toBe("token");
    expect(body.expiration).toBeDefined();

    const sentCommand = stsSendMock.mock.calls[0]?.[0];
    expect(sentCommand.input.RoleArn).toBe("arn:aws:iam::123:role/storage");
    expect(sentCommand.input.WebIdentityToken).toBe(ACCESS_TOKEN);
  });

  test("never returns credential material beyond the STS triple", async () => {
    const response = (await action(args(buildRequest({ token: PRESENTED_TOKEN })))) as Response;

    const body = (await response.json()) as Record<string, unknown>;
    expect(body).not.toHaveProperty("refreshToken");
    expect(Object.keys(body).sort()).toEqual([
      "accessKeyId",
      "expiration",
      "secretAccessKey",
      "sessionToken",
    ]);
  });

  test("no request field influences the binding, the scope, or the role", async () => {
    const response = (await action(
      args(
        buildRequest({
          token: PRESENTED_TOKEN,
          jobId: "someone-elses-job",
          organization: "other-corp",
          roleArn: "arn:aws:iam::999:role/over-privileged",
          bucket: "other-bucket",
          prefix: "secrets/",
        }),
      ),
    )) as Response;

    expect(response.status).toBe(200);
    // The resolver saw only the token; the row it returned is the whole authority.
    expect(resolveJobBindingMock).toHaveBeenCalledWith(PRESENTED_TOKEN);
    expect(resolveJobBindingMock).toHaveBeenCalledTimes(1);

    const sentCommand = stsSendMock.mock.calls[0]?.[0];
    expect(sentCommand.input.RoleArn).toBe("arn:aws:iam::123:role/storage");
    const policy = String(sentCommand.input.Policy);
    expect(policy).toContain("cases/case1/*");
    expect(policy).toContain("results/run42/*");
    expect(policy).not.toContain("other-bucket");
    expect(policy).not.toContain("secrets/");
  });

  test("one job's token never resolves another job's row", async () => {
    resolveJobBindingMock.mockResolvedValueOnce(null);

    const response = (await action(
      args(buildRequest({ token: "job-as-token", jobId: "job-b" })),
    )) as Response;

    expect(response.status).toBe(403);
    expect(resolveJobBindingMock).toHaveBeenCalledWith("job-as-token");
    expect(stsSendMock).not.toHaveBeenCalled();
  });

  test("serves the mint from the batch's cached access token without a refusal", async () => {
    await action(args(buildRequest({ token: PRESENTED_TOKEN })));

    expect(resolveBatchAccessTokenMock).toHaveBeenCalledWith("batch-1");
    expect(resolveBatchAccessTokenMock).toHaveBeenCalledTimes(1);
  });

  test("returns 403 when the identity service refuses the refresh (grant withdrawn, binding alive)", async () => {
    const { JobGrantRefusedError } = await import("~/.server/auth/refreshJobToken");
    resolveBatchAccessTokenMock.mockRejectedValueOnce(
      new JobGrantRefusedError(400, "invalid_grant"),
    );

    const response = (await action(args(buildRequest({ token: PRESENTED_TOKEN })))) as Response;

    expect(response.status).toBe(403);
    expect((await response.json()) as { error: string }).toMatchObject({
      error: /expired or revoked/i,
    });
    expect(stsSendMock).not.toHaveBeenCalled();
  });

  test("returns 503, not 403, when the refresh fails for a hosting fault rather than a refusal", async () => {
    resolveBatchAccessTokenMock.mockRejectedValueOnce(
      new Error("Failed to acquire Redis lock after maximum retries"),
    );

    const response = (await action(args(buildRequest({ token: PRESENTED_TOKEN })))) as Response;

    // A lock, database, or network fault says nothing about the grant, so the
    // container is told to retry rather than to give up.
    expect(response.status).toBe(503);
    expect((await response.json()) as { error: string }).toMatchObject({
      error: /temporarily unavailable/i,
    });
    expect(stsSendMock).not.toHaveBeenCalled();
  });

  test("returns 400 for a non-string token instead of failing on the hash", async () => {
    const response = (await action(args(buildRequest({ token: 303 })))) as Response;

    expect(response.status).toBe(400);
    expect(resolveJobBindingMock).not.toHaveBeenCalled();
  });

  test("returns 401 when the row is live but the batch holds no credential record (grant lapsed)", async () => {
    resolveBatchAccessTokenMock.mockResolvedValueOnce(null);

    const response = (await action(args(buildRequest({ token: PRESENTED_TOKEN })))) as Response;

    expect(response.status).toBe(401);
    expect((await response.json()) as { error: string }).toMatchObject({
      error: /expired or revoked/i,
    });
    expect(stsSendMock).not.toHaveBeenCalled();
  });

  test("the resolution runs under the token alone, never a caller-supplied job id", async () => {
    await action(args(buildRequest({ token: PRESENTED_TOKEN, jobId: "job-b" })));

    expect(resolveJobBindingMock).toHaveBeenCalledWith(PRESENTED_TOKEN);
    expect(resolveJobBindingMock).toHaveBeenCalledTimes(1);
  });

  test("session policy is scoped to the ledger-recorded targets", async () => {
    await action(args(buildRequest({ token: PRESENTED_TOKEN })));

    const sentCommand = stsSendMock.mock.calls[0]?.[0];
    expect(sentCommand.input.Policy).toContain("s3:PutObject");
    expect(sentCommand.input.Policy).toContain("results/run42/*");
    expect(sentCommand.input.Policy).toContain("s3:GetObject");
    expect(sentCommand.input.Policy).toContain("cases/case1/*");
  });

  test("mints without a session policy when the row has no output target (legacy row)", async () => {
    resolveJobBindingMock.mockResolvedValueOnce({
      ...BINDING,
      row: { ...LEDGER_ROW, inputS3Uris: [], outputS3Uri: "" },
    });

    const response = (await action(args(buildRequest({ token: PRESENTED_TOKEN })))) as Response;

    expect(response.status).toBe(200);
    expect(stsSendMock.mock.calls[0]?.[0].input.Policy).toBeUndefined();
  });

  test("returns 403 when the row predates role recording", async () => {
    resolveJobBindingMock.mockResolvedValueOnce({
      ...BINDING,
      row: { ...LEDGER_ROW, roleArn: "" },
    });

    const response = (await action(args(buildRequest({ token: PRESENTED_TOKEN })))) as Response;

    expect(response.status).toBe(403);
    expect((await response.json()) as { error: string }).toMatchObject({
      error: /predates role recording/i,
    });
    expect(stsSendMock).not.toHaveBeenCalled();
  });

  test("returns 503, not 403, when STS fails — the job's authorization is intact", async () => {
    stsSendMock.mockRejectedValue(new Error("STS is unreachable"));

    const response = (await action(args(buildRequest({ token: PRESENTED_TOKEN })))) as Response;

    // A provider outage says nothing about the grant, so the container retries
    // instead of abandoning a valid job.
    expect(response.status).toBe(503);
    expect((await response.json()) as { error: string }).toMatchObject({
      error: /temporarily unavailable/i,
    });
  });

  test("never echoes internal failure detail to the container", async () => {
    stsSendMock.mockRejectedValue(new Error("arn:aws:iam::123:role/storage has no trust policy"));

    const response = (await action(args(buildRequest({ token: PRESENTED_TOKEN })))) as Response;
    const body = (await response.json()) as { error: string };

    expect(body.error).not.toMatch(/arn:|trust policy/i);
  });

  test("retries without the inline policy when STS rejects it as too large", async () => {
    const tooLarge = Object.assign(new Error("Packed policy too large"), {
      name: "PackedPolicyTooLargeException",
    });
    stsSendMock.mockRejectedValueOnce(tooLarge).mockResolvedValueOnce(STS_CREDENTIALS);

    const response = (await action(args(buildRequest({ token: PRESENTED_TOKEN })))) as Response;

    expect(response.status).toBe(200);
    expect(stsSendMock).toHaveBeenCalledTimes(2);
    expect(stsSendMock.mock.calls[1]?.[0].input.Policy).toBeUndefined();
  });

  test("RoleSessionName derives from the row's owner", async () => {
    await action(args(buildRequest({ token: PRESENTED_TOKEN })));

    expect(stsSendMock.mock.calls[0]?.[0].input.RoleSessionName).toContain("submitting-user-42");
  });
});
