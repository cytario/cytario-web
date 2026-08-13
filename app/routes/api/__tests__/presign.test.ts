import { beforeEach, describe, expect, test, vi } from "vitest";

import { authContext } from "~/.server/auth/authMiddleware";
import { action } from "~/routes/api/presign";
import mock from "~/utils/__tests__/__mocks__";

// ─── Mocks ────────────────────────────────────────────────────────────

const getConnectionMock = vi.hoisted(() => vi.fn());
vi.mock("~/routes/connections/connections.server", () => ({
  getConnection: getConnectionMock,
}));

const getProviderCatalogMock = vi.hoisted(() => vi.fn());
const resolveWithGrantsMock = vi.hoisted(() => vi.fn());
vi.mock("~/.server/providers/providerCatalog.server", () => ({
  getProviderCatalog: getProviderCatalogMock,
  resolveConnectionProviderWithGrants: resolveWithGrantsMock,
}));

const pickGrantForUserMock = vi.hoisted(() => vi.fn());
vi.mock("~/.server/auth/getSessionCredentials", () => ({
  pickGrantForUser: pickGrantForUserMock,
}));

vi.mock("~/.server/db/prisma", () => ({ prisma: {} }));
vi.mock("~/.server/db/redis", () => ({ redis: {} }));

// Mock S3 client + presigner
const getSignedUrlMock = vi.hoisted(() => vi.fn());
vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: getSignedUrlMock,
}));

vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class {
    constructor() {}
  },
  GetObjectCommand: class {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  },
  PutObjectCommand: class {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  },
  ListObjectsV2Command: class {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  },
}));

// ─── Helpers ─────────────────────────────────────────────────────────

const S3_ENDPOINT = "https://s3.eu-central-1.amazonaws.com";
const BUCKET = "test-bucket";
const REGION = "eu-central-1";

function buildArgs(
  body: unknown,
  user?: ReturnType<typeof mock.user>,
) {
  const ctx = new Map<unknown, unknown>();
  ctx.set(authContext, {
    user: user ?? mock.user(),
    authTokens: { accessToken: "test-token", idToken: "test-id" },
  });
  return {
    request: new Request("http://localhost/api/presign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    params: {},
    context: {
      get: (k: unknown) => ctx.get(k),
      set: (k: unknown, v: unknown) => ctx.set(k, v),
    },
  } as unknown as Parameters<typeof action>[0];
}

  function setupResolvedProvider(overrides?: {
    credentialMode?: "sts" | "presigned";
    staticCredentials?: { accessKeyId: string; secretAccessKey: string } | null;
    endpoint?: string | null;
    region?: string;
    grants?: Array<{ scope: string; roleArn: string | null; accessLevel: string }>;
  }) {
    const resolved = {
      providerType: "presigned" as const,
      endpoint: overrides?.endpoint ?? S3_ENDPOINT,
      region: overrides?.region ?? REGION,
      allowsSharing: false,
      grants: overrides?.grants ?? [
        { scope: "org1/lab", roleArn: null, accessLevel: "read-write" },
      ],
      credentialMode: overrides?.credentialMode ?? "presigned",
      staticCredentials:
        overrides && "staticCredentials" in overrides
          ? overrides.staticCredentials
          : { accessKeyId: "AKIA-test", secretAccessKey: "secret-test" },
    };
    resolveWithGrantsMock.mockReturnValue(resolved);
    return resolved;
  }

function setupConnection(overrides?: {
  bucketName?: string;
  prefix?: string;
  organization?: string;
}) {
  const conn = mock.connectionConfig({
    bucketName: overrides?.bucketName ?? BUCKET,
    prefix: overrides?.prefix ?? "",
    organization: overrides?.organization ?? "org1",
  });
  getConnectionMock.mockResolvedValue(conn);
  return conn;
}

beforeEach(() => {
  vi.clearAllMocks();
  getSignedUrlMock.mockResolvedValue("https://presigned-url.example/signed");
});

// ─── Tests ───────────────────────────────────────────────────────────

describe("POST /api/presign (C-377)", () => {
  test("returns 400 when body is missing required fields", async () => {
    const response = (await action(
      buildArgs({ connectionId: "c1" }),
    )) as Response;
    expect(response.status).toBe(400);
  });

  test("returns 400 on invalid JSON", async () => {
    const ctx = new Map();
    ctx.set(authContext, {
      user: mock.user(),
      authTokens: { accessToken: "t", idToken: "i" },
    });
    const response = (await action({
      request: new Request("http://localhost/api/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not json",
      }),
      params: {},
      context: {
        get: (k: unknown) => ctx.get(k),
        set: (k: unknown, v: unknown) => ctx.set(k, v),
      },
    } as never)) as Response;
    expect(response.status).toBe(400);
  });

  test("returns 404 when connection is not found", async () => {
    getConnectionMock.mockResolvedValue(null);
    const response = (await action(
      buildArgs({ connectionId: "missing", url: `${S3_ENDPOINT}/${BUCKET}/key`, method: "GET" }),
    )) as Response;
    expect(response.status).toBe(404);
  });

  test("returns 400 when connection uses STS, not presigned", async () => {
    setupConnection();
    setupResolvedProvider({ credentialMode: "sts" });
    const response = (await action(
      buildArgs({ connectionId: "c1", url: `${S3_ENDPOINT}/${BUCKET}/key`, method: "GET" }),
    )) as Response;
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("does not use presigned");
  });

  test("returns 502 when static credentials are missing", async () => {
    setupConnection();
    setupResolvedProvider({ staticCredentials: null });
    const response = (await action(
      buildArgs({ connectionId: "c1", url: `${S3_ENDPOINT}/${BUCKET}/key`, method: "GET" }),
    )) as Response;
    expect(response.status).toBe(502);
  });

  test("returns 403 when user has no applicable grant", async () => {
    setupConnection();
    setupResolvedProvider();
    pickGrantForUserMock.mockReturnValue(undefined);
    const response = (await action(
      buildArgs({ connectionId: "c1", url: `${S3_ENDPOINT}/${BUCKET}/key`, method: "GET" }),
    )) as Response;
    expect(response.status).toBe(403);
  });

  test("returns 403 for non-allowlisted host", async () => {
    setupConnection();
    setupResolvedProvider();
    pickGrantForUserMock.mockReturnValue({
      scope: "org1/lab",
      roleArn: null,
      accessLevel: "read-write",
    });
    const response = (await action(
      buildArgs({
        connectionId: "c1",
        url: "https://evil.example.com/test-bucket/key",
        method: "GET",
      }),
    )) as Response;
    expect(response.status).toBe(403);
    expect((await response.json()).error).toContain("allowlist");
  });

  test("returns 400 when URL bucket does not match connection bucket", async () => {
    setupConnection();
    setupResolvedProvider();
    pickGrantForUserMock.mockReturnValue({
      scope: "org1/lab",
      roleArn: null,
      accessLevel: "read-write",
    });
    const response = (await action(
      buildArgs({
        connectionId: "c1",
        url: `${S3_ENDPOINT}/other-bucket/key`,
        method: "GET",
      }),
    )) as Response;
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("bucket");
  });

  test("mints a presigned GET URL and returns { presignedUrl, expiresAt }", async () => {
    setupConnection();
    setupResolvedProvider();
    pickGrantForUserMock.mockReturnValue({
      scope: "org1/lab",
      roleArn: null,
      accessLevel: "read-write",
    });
    getSignedUrlMock.mockResolvedValue("https://presigned.example/signed-get");

    const response = (await action(
      buildArgs({
        connectionId: "c1",
        url: `${S3_ENDPOINT}/${BUCKET}/path/to/image.tif`,
        method: "GET",
      }),
    )) as Response;

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.presignedUrl).toBe("https://presigned.example/signed-get");
    expect(body.expiresAt).toBeDefined();
    expect(new Date(body.expiresAt).getTime()).toBeGreaterThan(Date.now());
    expect(response.headers.get("Cache-Control")).toBe("no-store, private");
  });

  test("read-only access denies PUT", async () => {
    setupConnection();
    setupResolvedProvider();
    pickGrantForUserMock.mockReturnValue({
      scope: "org1/lab",
      roleArn: null,
      accessLevel: "read-only",
    });

    const response = (await action(
      buildArgs({
        connectionId: "c1",
        url: `${S3_ENDPOINT}/${BUCKET}/some-key.json`,
        method: "PUT",
      }),
    )) as Response;
    expect(response.status).toBe(403);
    expect((await response.json()).error).toContain("does not permit writes");
  });

  test("annotate access allows PUT only to *.annotations.<sub>.json", async () => {
    setupConnection({ prefix: "cases/case1" });
    setupResolvedProvider();
    pickGrantForUserMock.mockReturnValue({
      scope: "org1/lab",
      roleArn: null,
      accessLevel: "annotate",
    });
    const user = mock.user({ sub: "user-42" });

    // Non-annotation key → 403
    const denied = (await action(
      buildArgs(
        {
          connectionId: "c1",
          url: `${S3_ENDPOINT}/${BUCKET}/cases/case1/data.tif`,
          method: "PUT",
        },
        user,
      ),
    )) as Response;
    expect(denied.status).toBe(403);

    // Annotation key → 200
    getSignedUrlMock.mockResolvedValue("https://presigned.example/annot");
    const allowed = (await action(
      buildArgs(
        {
          connectionId: "c1",
          url: `${S3_ENDPOINT}/${BUCKET}/cases/case1/data.annotations.user-42.json`,
          method: "PUT",
        },
        user,
      ),
    )) as Response;
    expect(allowed.status).toBe(200);
  });

  test("annotate access rejects annotation key outside the prefix", async () => {
    setupConnection({ prefix: "cases/case1" });
    setupResolvedProvider();
    pickGrantForUserMock.mockReturnValue({
      scope: "org1/lab",
      roleArn: null,
      accessLevel: "annotate",
    });
    const user = mock.user({ sub: "user-42" });

    const response = (await action(
      buildArgs(
        {
          connectionId: "c1",
          url: `${S3_ENDPOINT}/${BUCKET}/other/data.annotations.user-42.json`,
          method: "PUT",
        },
        user,
      ),
    )) as Response;
    expect(response.status).toBe(403);
    expect((await response.json()).error).toContain("prefix");
  });

  test("read-write allows PUT under the prefix", async () => {
    setupConnection({ prefix: "lab" });
    setupResolvedProvider();
    pickGrantForUserMock.mockReturnValue({
      scope: "org1/lab",
      roleArn: null,
      accessLevel: "read-write",
    });

    getSignedUrlMock.mockResolvedValue("https://presigned.example/put");
    const response = (await action(
      buildArgs({
        connectionId: "c1",
        url: `${S3_ENDPOINT}/${BUCKET}/lab/results/output.json`,
        method: "PUT",
      }),
    )) as Response;
    expect(response.status).toBe(200);
  });

  test("read-write rejects PUT outside the prefix", async () => {
    setupConnection({ prefix: "lab" });
    setupResolvedProvider();
    pickGrantForUserMock.mockReturnValue({
      scope: "org1/lab",
      roleArn: null,
      accessLevel: "read-write",
    });

    const response = (await action(
      buildArgs({
        connectionId: "c1",
        url: `${S3_ENDPOINT}/${BUCKET}/other/results.json`,
        method: "PUT",
      }),
    )) as Response;
    expect(response.status).toBe(403);
  });

  test("handles ListObjectsV2 presigning", async () => {
    setupConnection();
    setupResolvedProvider();
    pickGrantForUserMock.mockReturnValue({
      scope: "org1/lab",
      roleArn: null,
      accessLevel: "read-write",
    });
    getSignedUrlMock.mockResolvedValue("https://presigned.example/list");

    const response = (await action(
      buildArgs({
        connectionId: "c1",
        url: `${S3_ENDPOINT}/${BUCKET}?list-type=2&prefix=lab/`,
        method: "GET",
      }),
    )) as Response;
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.presignedUrl).toBe("https://presigned.example/list");
  });

  test("returns 500 when presigner throws", async () => {
    setupConnection();
    setupResolvedProvider();
    pickGrantForUserMock.mockReturnValue({
      scope: "org1/lab",
      roleArn: null,
      accessLevel: "read-write",
    });
    getSignedUrlMock.mockRejectedValue(new Error("signing failed"));

    const response = (await action(
      buildArgs({
        connectionId: "c1",
        url: `${S3_ENDPOINT}/${BUCKET}/key`,
        method: "GET",
      }),
    )) as Response;
    expect(response.status).toBe(500);
  });

  test("returns 502 when provider catalog throws", async () => {
    setupConnection();
    getProviderCatalogMock.mockRejectedValue(new Error("catalog down"));

    const response = (await action(
      buildArgs({ connectionId: "c1", url: `${S3_ENDPOINT}/${BUCKET}/key`, method: "GET" }),
    )) as Response;
    expect(response.status).toBe(502);
  });

  test("returns 502 when resolved provider is undefined (stale lookup)", async () => {
    setupConnection();
    resolveWithGrantsMock.mockReturnValue(undefined);

    const response = (await action(
      buildArgs({ connectionId: "c1", url: `${S3_ENDPOINT}/${BUCKET}/key`, method: "GET" }),
    )) as Response;
    expect(response.status).toBe(502);
  });

  describe("dev localhost SSRF carve-out", () => {
    test("allows http://localhost in development", async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "development";

      setupConnection({ bucketName: BUCKET });
      setupResolvedProvider({
        endpoint: "http://localhost:9000",
        region: "local",
      });
      pickGrantForUserMock.mockReturnValue({
        scope: "org1/lab",
        roleArn: null,
        accessLevel: "read-write",
      });
      getSignedUrlMock.mockResolvedValue("http://localhost:9000/signed");

      const response = (await action(
        buildArgs({
          connectionId: "c1",
          url: "http://localhost:9000/test-bucket/key",
          method: "GET",
        }),
      )) as Response;

      expect(response.status).toBe(200);
      process.env.NODE_ENV = originalEnv;
    });
  });
});
