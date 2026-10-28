import { describe, expect, test, vi } from "vitest";

import { authContext } from "~/.server/auth/authMiddleware";
import { sessionContext } from "~/.server/auth/sessionMiddleware";
import { prisma } from "~/.server/db/prisma";
import { getProviderCatalog } from "~/.server/providers/providerCatalog.server";
import { createAction } from "~/routes/connections/createConnection.action";
import mock from "~/utils/__tests__/__mocks__";

vi.mock("~/.server/db/prisma", () => ({
  prisma: {
    connectionConfig: {
      findFirst: vi.fn(async () => null),
      findMany: vi.fn(async () => []),
      update: vi.fn(),
      create: vi.fn(),
    },
  },
}));
vi.mock("~/.server/db/redis", () => ({ redis: {} }));
vi.mock("~/.server/auth/sessionStorage", () => ({
  sessionStorage: { commitSession: vi.fn(async () => "cookie") },
}));

vi.mock("~/.server/providers/providerCatalog.server", async () => {
  const actual = await vi.importActual<typeof import("~/.server/providers/providerCatalog.server")>(
    "~/.server/providers/providerCatalog.server",
  );
  return { ...actual, getProviderCatalog: vi.fn() };
});

vi.mock("~/.server/providers/bucketCatalog.server", async () => {
  const actual = await vi.importActual<typeof import("~/.server/providers/bucketCatalog.server")>(
    "~/.server/providers/bucketCatalog.server",
  );
  return { ...actual, getBucketCatalog: vi.fn() };
});

vi.mock("~/.server/storage/bucketPolicyApply.server", () => ({
  applyBucketPolicy: vi.fn(async () => ({ status: "applied" })),
}));

vi.mock("~/config", () => ({
  cytarioConfig: {
    endpoints: { webapp: "https://app.cytar.io" },
    providers: { source: "oss" },
  },
}));

function buildArgs(form: Record<string, string>) {
  const ctx = new Map<unknown, unknown>();
  ctx.set(authContext, {
    user: mock.user({ adminScopes: ["org1/lab"], organization: "org1" }),
    authTokens: { accessToken: "access-token" },
  });
  ctx.set(sessionContext, mock.session({ authTokens: { idToken: "tok" } as never }));
  const request = new Request("http://localhost/connections", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form).toString(),
  });
  return {
    request,
    params: {},
    context: { get: (k: unknown) => ctx.get(k), set: (k: unknown, v: unknown) => ctx.set(k, v) },
  } as unknown as Parameters<typeof createAction>[0];
}

const publicForm = {
  name: "open-data",
  bucketName: "open-bucket",
  providerConnectionId: "pc-public",
  prefix: "",
  "grants[0].scope": "org1/lab",
  "grants[0].accessLevel": "read-only",
};

const publicCatalog = mock.providerCatalog({
  providerConnections: [mock.providerConnection({ id: "pc-public", isPublic: true })],
  providerRoles: [],
});

const fetchMock = vi.fn();

describe("createAction — public provider connections", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("refuses a bucket that forbids anonymous listing before any row is written", async () => {
    vi.mocked(getProviderCatalog).mockResolvedValue(publicCatalog);
    fetchMock.mockResolvedValue(new Response("AccessDenied", { status: 403 }));

    const result = await createAction(buildArgs(publicForm));

    expect(result).toEqual({
      formError: expect.stringContaining("does not allow public listing"),
      status: "error",
    });
    expect(prisma.connectionConfig.create).not.toHaveBeenCalled();
  });

  test("warns (but proceeds) when the bucket allows listing without CORS for the origin", async () => {
    vi.mocked(getProviderCatalog).mockResolvedValue(publicCatalog);
    const body =
      '<?xml version="1.0"?><ListBucketResult><IsTruncated>false</IsTruncated></ListBucketResult>';
    fetchMock.mockResolvedValueOnce(
      new Response(body, { status: 200, headers: { "access-control-allow-origin": "*" } }),
    );
    // The CORS probe (second call) returns no access-control-allow-origin.
    fetchMock.mockResolvedValueOnce(new Response(body, { status: 200 }));
    const created = mock.connectionConfig({
      id: "conn-public",
      providerConnectionId: "pc-public",
    });
    vi.mocked(prisma.connectionConfig.create).mockResolvedValue(created);

    const result = await createAction(buildArgs(publicForm));

    expect(result).toBeInstanceOf(Response);
    expect(prisma.connectionConfig.create).toHaveBeenCalled();
    // The public path records externally_managed rather than applying.
    expect(prisma.connectionConfig.update).toHaveBeenCalledWith({
      where: { id: "conn-public" },
      data: { bucketPolicyStatus: "externally_managed" },
    });
  });

  test("rejects a non-read-only grant level on a public provider", async () => {
    vi.mocked(getProviderCatalog).mockResolvedValue(publicCatalog);

    const result = await createAction(
      buildArgs({ ...publicForm, "grants[0].accessLevel": "read-write" }),
    );

    expect(result).toEqual({
      errors: {
        "grants.0.accessLevel": [
          "A public provider connection only supports the read-only access level",
        ],
      },
      status: "error",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(prisma.connectionConfig.create).not.toHaveBeenCalled();
  });

  test("refuses an endpoint outside the allowed storage hosts without probing it", async () => {
    vi.mocked(getProviderCatalog).mockResolvedValue(
      mock.providerCatalog({
        providerConnections: [
          mock.providerConnection({
            id: "pc-public",
            isPublic: true,
            endpoint: "https://169.254.169.254",
          }),
        ],
        providerRoles: [],
      }),
    );

    const result = await createAction(buildArgs(publicForm));

    expect(result).toEqual({
      formError: expect.stringContaining("not an allowed storage host"),
      status: "error",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(prisma.connectionConfig.create).not.toHaveBeenCalled();
  });

  test("refuses a non-allowlisted typed endpoint inside the probe", async () => {
    vi.mocked(getProviderCatalog).mockResolvedValue(publicCatalog);

    const result = await createAction(
      buildArgs({ ...publicForm, publicEndpoint: "https://intranet.internal:9000" }),
    );

    expect(result).toEqual({
      formError: expect.stringContaining("not an allowed storage host"),
      status: "error",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(prisma.connectionConfig.create).not.toHaveBeenCalled();
  });

  test("refuses a plaintext non-loopback typed endpoint", async () => {
    vi.mocked(getProviderCatalog).mockResolvedValue(publicCatalog);

    const result = await createAction(
      buildArgs({ ...publicForm, publicEndpoint: "http://example.com" }),
    );

    expect(result).toEqual({
      errors: { publicEndpoint: [expect.stringContaining("https://")] },
      status: "error",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("probes the typed endpoint and persists it on the created row", async () => {
    vi.mocked(getProviderCatalog).mockResolvedValue(publicCatalog);
    const body =
      '<?xml version="1.0"?><ListBucketResult><IsTruncated>false</IsTruncated></ListBucketResult>';
    fetchMock.mockResolvedValue(
      new Response(body, { status: 200, headers: { "access-control-allow-origin": "*" } }),
    );
    const created = mock.connectionConfig({
      id: "conn-public",
      providerConnectionId: "pc-public",
    });
    vi.mocked(prisma.connectionConfig.create).mockResolvedValue(created);

    const result = await createAction(
      buildArgs({ ...publicForm, publicEndpoint: "http://localhost:9000" }),
    );

    expect(result).toBeInstanceOf(Response);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:9000/open-bucket?list-type=2&max-keys=1",
      expect.anything(),
    );
    expect(prisma.connectionConfig.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ publicEndpoint: "http://localhost:9000" }),
      }),
    );
  });

  test("persists null when the typed endpoint is empty", async () => {
    vi.mocked(getProviderCatalog).mockResolvedValue(publicCatalog);
    const body =
      '<?xml version="1.0"?><ListBucketResult><IsTruncated>false</IsTruncated></ListBucketResult>';
    fetchMock.mockResolvedValue(
      new Response(body, { status: 200, headers: { "access-control-allow-origin": "*" } }),
    );
    const created = mock.connectionConfig({
      id: "conn-public",
      providerConnectionId: "pc-public",
    });
    vi.mocked(prisma.connectionConfig.create).mockResolvedValue(created);

    const result = await createAction(buildArgs(publicForm));

    expect(result).toBeInstanceOf(Response);
    expect(prisma.connectionConfig.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ publicEndpoint: null }) }),
    );
  });

  test("strips a submitted endpoint on a non-public provider (persists null)", async () => {
    const privateCatalog = mock.providerCatalog({
      providerConnections: [mock.providerConnection({ id: "pc-mock" })],
      providerRoles: [
        mock.providerRole({
          providerConnectionId: "pc-mock",
          accessLevel: "read-only",
          allowedScopes: [],
        }),
      ],
    });
    vi.mocked(getProviderCatalog).mockResolvedValue(privateCatalog);
    const created = mock.connectionConfig({ id: "conn-private" });
    vi.mocked(prisma.connectionConfig.create).mockResolvedValue(created);
    vi.mocked(prisma.connectionConfig.findMany).mockResolvedValue([]);

    const result = await createAction(
      buildArgs({
        name: "private-conn",
        bucketName: "private-bucket",
        providerConnectionId: "pc-mock",
        prefix: "",
        publicEndpoint: "https://s3.us-east-1.amazonaws.com",
        "grants[0].scope": "org1/lab",
        "grants[0].accessLevel": "read-only",
      }),
    );

    expect(result).toBeInstanceOf(Response);
    expect(prisma.connectionConfig.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ publicEndpoint: null }) }),
    );
  });

  test("skips the anonymous probe for a non-public provider", async () => {
    vi.mocked(getProviderCatalog).mockResolvedValue(
      mock.providerCatalog({
        providerConnections: [mock.providerConnection({ id: "pc-public" })],
        providerRoles: [
          mock.providerRole({
            providerConnectionId: "pc-public",
            accessLevel: "read-only",
            allowedScopes: [],
          }),
        ],
      }),
    );
    const created = mock.connectionConfig({
      id: "conn-private",
      providerConnectionId: "pc-public",
    });
    vi.mocked(prisma.connectionConfig.create).mockResolvedValue(created);
    vi.mocked(prisma.connectionConfig.findMany).mockResolvedValue([]);

    const result = await createAction(buildArgs(publicForm));

    expect(result).toBeInstanceOf(Response);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(prisma.connectionConfig.create).toHaveBeenCalled();
  });
});
