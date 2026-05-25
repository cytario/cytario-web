import { authContext } from "~/.server/auth/authMiddleware";
import { sessionContext } from "~/.server/auth/sessionMiddleware";
import { probeBucketCors } from "~/.server/corsPreflight";
import { prisma } from "~/.server/db/prisma";
import { createAction } from "~/routes/connections/createConnection.action";
import { deleteAction, deleteConnection } from "~/routes/connections/deleteConnection.action";
import { updateAction, updateConnection } from "~/routes/connections/updateConnection.action";
import mock from "~/utils/__tests__/__mocks__";

vi.mock("~/.server/db/prisma", () => ({
  prisma: {
    connectionConfig: {
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

vi.mock("~/.server/db/redis", () => ({
  redis: {},
}));

vi.mock("~/.server/corsPreflight", () => ({
  probeBucketCors: vi.fn(),
  describeCorsFailure: (result: { reason?: string; detail?: string }, origin: string): string => {
    switch (result.reason) {
      case "network":
        return "Could not reach the bucket from the cytario server. Check the endpoint URL and DNS.";
      case "missing_origin_header":
        return `Bucket does not advertise CORS for cytario. Configure the bucket's CORS policy to allow Origin ${origin}.`;
      case "preflight_status":
        return `Bucket rejected the cytario CORS preflight (${result.detail ?? "non-2xx"}).`;
      default:
        return `Bucket CORS preflight failed: ${result.detail ?? "unknown"}.`;
    }
  },
  describeCorsWarning: (warning: string, origin: string): string => {
    if (warning === "wildcard_origin") {
      return `Bucket allows any origin (CORS: *). Consider restricting to ${origin}.`;
    }
    return "";
  },
}));

vi.mock("~/config", () => ({
  cytarioConfig: {
    endpoints: { webapp: "http://localhost:3000" },
    auth: {
      baseUrl: "http://localhost:8080/realms/master",
      clientId: "id",
      clientSecret: "secret",
      cyberduckClientId: "cy",
      adminClientId: "ad",
      adminClientSecret: "adsec",
      scopes: ["openid"],
    },
    redis: { port: 6379, host: "localhost" },
    cookie: { secrets: ["test"] },
  },
}));

vi.mock("~/.server/auth/sessionStorage", () => ({
  sessionStorage: {
    commitSession: vi.fn(async () => "session-cookie"),
  },
}));

// Authorization is NOT mocked — real canSee/canModify/canCreate logic runs

const cytarioConfig = mock.connectionConfig({
  ownerScope: "cytario",
  name: "test-connection",
});

const personalConfig = mock.connectionConfig({
  ownerScope: "mock-user-id",
  name: "personal-connection",
});

const adminUser = mock.user({
  sub: "admin-user-id",
  groups: ["cytario"],
  adminScopes: ["cytario"],
});

const regularUser = mock.user({
  sub: "regular-user-id",
  groups: ["cytario"],
  adminScopes: [],
});

const personalUser = mock.user({
  sub: "mock-user-id",
  groups: ["cytario"],
  adminScopes: [],
});

const orgRootAdmin = mock.user({
  sub: "org-root-admin-id",
  groups: [],
  adminScopes: ["*"],
});

const outsideUser = mock.user({
  sub: "outside-user-id",
  groups: ["other-org"],
  adminScopes: ["other-org"],
});

const validUpdates = {
  name: "updated-connection",
  ownerScope: "cytario",
  provider: "aws",
  bucketName: "updated-bucket",
  prefix: "",
  endpoint: "https://s3.eu-central-1.amazonaws.com",
  roleArn: "arn:aws:iam::123:role/test",
  region: "eu-central-1",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(probeBucketCors).mockResolvedValue({ ok: true, warnings: [] });
});

describe("deleteConnection authorization", () => {
  test("admin of scope can delete", async () => {
    vi.mocked(prisma.connectionConfig.findFirst).mockResolvedValue(cytarioConfig);

    await deleteConnection(adminUser, "test-connection");

    expect(prisma.connectionConfig.delete).toHaveBeenCalledWith({
      where: { id: cytarioConfig.id },
    });
  });

  test("owner (personal scope) can delete", async () => {
    vi.mocked(prisma.connectionConfig.findFirst).mockResolvedValue(personalConfig);

    await deleteConnection(personalUser, "personal-connection");

    expect(prisma.connectionConfig.delete).toHaveBeenCalled();
  });

  test("org-root admin can delete any connection within the org", async () => {
    vi.mocked(prisma.connectionConfig.findFirst).mockResolvedValue(cytarioConfig);

    await deleteConnection(orgRootAdmin, "test-connection");

    expect(prisma.connectionConfig.delete).toHaveBeenCalled();
  });

  test("group member without admin cannot delete", async () => {
    vi.mocked(prisma.connectionConfig.findFirst).mockResolvedValue(cytarioConfig);

    await expect(deleteConnection(regularUser, "test-connection")).rejects.toThrow(
      "Not authorized to delete this connection config",
    );
  });

  test("user from different scope cannot see or delete", async () => {
    vi.mocked(prisma.connectionConfig.findFirst).mockResolvedValue(cytarioConfig);

    await expect(deleteConnection(outsideUser, "test-connection")).rejects.toThrow(
      "Connection config not found",
    );
  });

  test("throws 'not found' when connection doesn't exist", async () => {
    vi.mocked(prisma.connectionConfig.findFirst).mockResolvedValue(null);

    await expect(deleteConnection(adminUser, "nonexistent")).rejects.toThrow(
      "Connection config not found",
    );
  });
});

describe("updateConnection authorization", () => {
  test("admin of scope can update", async () => {
    vi.mocked(prisma.connectionConfig.findFirst).mockResolvedValue(cytarioConfig);
    vi.mocked(prisma.connectionConfig.update).mockResolvedValue({
      ...cytarioConfig,
      ...validUpdates,
    });

    const result = await updateConnection(adminUser, "test-connection", validUpdates);

    expect(prisma.connectionConfig.update).toHaveBeenCalled();
    expect(result.name).toBe("updated-connection");
  });

  test("owner (personal scope) can update own connection", async () => {
    vi.mocked(prisma.connectionConfig.findFirst).mockResolvedValue(personalConfig);
    vi.mocked(prisma.connectionConfig.update).mockResolvedValue({
      ...personalConfig,
      ...validUpdates,
      ownerScope: "mock-user-id",
    });

    await updateConnection(personalUser, "personal-connection", {
      ...validUpdates,
      ownerScope: "mock-user-id",
    });

    expect(prisma.connectionConfig.update).toHaveBeenCalled();
  });

  test("org-root admin can update any connection within the org", async () => {
    vi.mocked(prisma.connectionConfig.findFirst).mockResolvedValue(cytarioConfig);
    vi.mocked(prisma.connectionConfig.update).mockResolvedValue({
      ...cytarioConfig,
      ...validUpdates,
    });

    await updateConnection(orgRootAdmin, "test-connection", validUpdates);

    expect(prisma.connectionConfig.update).toHaveBeenCalled();
  });

  test("group member without admin cannot update", async () => {
    vi.mocked(prisma.connectionConfig.findFirst).mockResolvedValue(cytarioConfig);

    await expect(updateConnection(regularUser, "test-connection", validUpdates)).rejects.toThrow(
      "Not authorized to modify this connection",
    );
  });

  test("user from different scope cannot see or update", async () => {
    vi.mocked(prisma.connectionConfig.findFirst).mockResolvedValue(cytarioConfig);

    await expect(updateConnection(outsideUser, "test-connection", validUpdates)).rejects.toThrow(
      "Connection not found",
    );
  });

  test("scope change requires canCreate on new scope", async () => {
    vi.mocked(prisma.connectionConfig.findFirst).mockResolvedValue(personalConfig);
    vi.mocked(prisma.connectionConfig.update).mockResolvedValue({
      ...personalConfig,
      ...validUpdates,
      ownerScope: "cytario",
    });

    // personalUser owns the connection (personal scope) and is in cytario group
    // but is NOT admin of cytario — cannot move to cytario scope
    await expect(
      updateConnection(personalUser, "personal-connection", {
        ...validUpdates,
        ownerScope: "cytario",
      }),
    ).rejects.toThrow("Not authorized to assign to this scope");
  });

  test("admin can change scope to their admin scope", async () => {
    // Admin owns a personal connection and moves it to cytario scope
    const adminPersonalConfig = mock.connectionConfig({
      ownerScope: "admin-user-id",
      name: "admin-personal",
    });

    vi.mocked(prisma.connectionConfig.findFirst).mockResolvedValue(adminPersonalConfig);
    vi.mocked(prisma.connectionConfig.update).mockResolvedValue({
      ...adminPersonalConfig,
      ...validUpdates,
      ownerScope: "cytario",
    });

    await updateConnection(adminUser, "admin-personal", {
      ...validUpdates,
      ownerScope: "cytario",
    });

    expect(prisma.connectionConfig.update).toHaveBeenCalled();
  });

  test("same-scope update does not check canCreate", async () => {
    // regularUser can see cytario-scoped but cannot modify
    // This test verifies canModify is checked, not canCreate
    vi.mocked(prisma.connectionConfig.findFirst).mockResolvedValue(cytarioConfig);

    await expect(updateConnection(regularUser, "test-connection", validUpdates)).rejects.toThrow(
      "Not authorized to modify this connection",
    );
  });

  test("throws 'not found' when connection doesn't exist", async () => {
    vi.mocked(prisma.connectionConfig.findFirst).mockResolvedValue(null);

    await expect(updateConnection(adminUser, "nonexistent", validUpdates)).rejects.toThrow(
      "Connection not found",
    );
  });
});

/**
 * Build an `ActionFunctionArgs`-shaped object whose `context.get` returns
 * the right value for `authContext` and `sessionContext`. Real action code
 * uses `context.get(authContext)` / `context.get(sessionContext)`.
 */
function buildActionArgs(
  user: ReturnType<typeof mock.user>,
  session: ReturnType<typeof mock.session>,
  formData: Record<string, string>,
) {
  const ctx = new Map<unknown, unknown>();
  ctx.set(authContext, { user });
  ctx.set(sessionContext, session);

  const body = new URLSearchParams(formData).toString();
  const request = new Request("http://localhost/connections", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  return {
    request,
    params: {},
    context: {
      get: (key: unknown) => ctx.get(key),
      set: (key: unknown, value: unknown) => ctx.set(key, value),
    },
  };
}

describe("deleteAction — session credential prune", () => {
  test("removes credentials[name] from session on successful delete", async () => {
    vi.mocked(prisma.connectionConfig.findFirst).mockResolvedValue(cytarioConfig);
    vi.mocked(prisma.connectionConfig.delete).mockResolvedValue(cytarioConfig);

    const existingCreds = {
      "test-connection": mock.credentials(),
      "other-connection": mock.credentials({ AccessKeyId: "other" }),
    };
    const session = mock.session({ credentials: existingCreds });

    const args = buildActionArgs(adminUser, session, {
      connectionName: "test-connection",
    });

    await deleteAction(args as unknown as Parameters<typeof deleteAction>[0]);

    // session.set was called with credentials, but without the deleted key
    const credentialsCall = vi
      .mocked(session.set)
      .mock.calls.find(([key]) => key === "credentials");
    expect(credentialsCall).toBeDefined();
    const writtenCreds = credentialsCall![1] as Record<string, unknown>;
    expect(writtenCreds).not.toHaveProperty("test-connection");
    expect(writtenCreds).toHaveProperty("other-connection");
  });

  test("does not throw when session has no credentials", async () => {
    vi.mocked(prisma.connectionConfig.findFirst).mockResolvedValue(cytarioConfig);
    vi.mocked(prisma.connectionConfig.delete).mockResolvedValue(cytarioConfig);

    const session = mock.session({});
    const args = buildActionArgs(adminUser, session, {
      connectionName: "test-connection",
    });

    await expect(
      deleteAction(args as unknown as Parameters<typeof deleteAction>[0]),
    ).resolves.toBeDefined();
  });
});

describe("createAction — CORS preflight probe", () => {
  const validAwsForm = {
    name: "cors-test-bucket",
    ownerScope: "cytario",
    providerType: "aws",
    s3Uri: "my-bucket",
    bucketRegion: "eu-central-1",
    roleArn: "arn:aws:iam::123456789012:role/MyRole",
    bucketEndpoint: "",
  };

  test("rejects with a CORS error when probe reports missing_origin_header", async () => {
    vi.mocked(probeBucketCors).mockResolvedValue({
      ok: false,
      reason: "missing_origin_header",
      warnings: [],
    });

    const session = mock.session({});
    const args = buildActionArgs(adminUser, session, validAwsForm);

    const result = (await createAction(args as unknown as Parameters<typeof createAction>[0])) as {
      formError?: string;
      status?: string;
    };

    expect(result.status).toBe("error");
    expect(result.formError).toMatch(/CORS/i);
    expect(prisma.connectionConfig.upsert).not.toHaveBeenCalled();
  });

  test("persists with a warning notification when probe reports wildcard_origin", async () => {
    vi.mocked(probeBucketCors).mockResolvedValue({
      ok: true,
      warnings: ["wildcard_origin"],
    });
    vi.mocked(prisma.connectionConfig.upsert).mockResolvedValue(cytarioConfig);

    const session = mock.session({});
    const sessionSet = vi.spyOn(session, "set");
    const args = buildActionArgs(adminUser, session, validAwsForm);

    await createAction(args as unknown as Parameters<typeof createAction>[0]);

    expect(prisma.connectionConfig.upsert).toHaveBeenCalled();
    const notification = sessionSet.mock.calls.find((c) => c[0] === "notification")?.[1] as
      | { status?: string; message?: string }
      | undefined;
    expect(notification?.status).toBe("warning");
    expect(notification?.message).toMatch(/\*/);
  });

  test("rejects with a network-specific message when probe reports network failure", async () => {
    vi.mocked(probeBucketCors).mockResolvedValue({
      ok: false,
      reason: "network",
      warnings: [],
      detail: "getaddrinfo ENOTFOUND",
    });

    const session = mock.session({});
    const args = buildActionArgs(adminUser, session, validAwsForm);

    const result = (await createAction(args as unknown as Parameters<typeof createAction>[0])) as {
      formError?: string;
      status?: string;
    };

    expect(result.status).toBe("error");
    expect(result.formError).toMatch(/Could not reach the bucket/i);
    expect(prisma.connectionConfig.upsert).not.toHaveBeenCalled();
  });

  test("persists when the probe passes", async () => {
    vi.mocked(probeBucketCors).mockResolvedValue({ ok: true, warnings: [] });
    vi.mocked(prisma.connectionConfig.upsert).mockResolvedValue(cytarioConfig);

    const session = mock.session({});
    const args = buildActionArgs(adminUser, session, validAwsForm);

    await createAction(args as unknown as Parameters<typeof createAction>[0]);

    expect(probeBucketCors).toHaveBeenCalledTimes(1);
    expect(prisma.connectionConfig.upsert).toHaveBeenCalled();
  });

  test("probes the bucket URL constructed from the connection config", async () => {
    vi.mocked(probeBucketCors).mockResolvedValue({ ok: true, warnings: [] });
    vi.mocked(prisma.connectionConfig.upsert).mockResolvedValue(cytarioConfig);

    const session = mock.session({});
    const args = buildActionArgs(adminUser, session, validAwsForm);

    await createAction(args as unknown as Parameters<typeof createAction>[0]);

    const [bucketUrl] = vi.mocked(probeBucketCors).mock.calls[0];
    expect(bucketUrl).toBe("https://s3.eu-central-1.amazonaws.com/my-bucket");
  });
});

describe("updateAction — CORS preflight probe", () => {
  test("re-probes when the endpoint changes and rejects on missing_origin_header", async () => {
    // existingConfig has bucketName "mock-bucket" + endpoint
    // https://s3.amazonaws.com — the update switches endpoint, so the
    // probe must run.
    vi.mocked(prisma.connectionConfig.findFirst).mockResolvedValue(cytarioConfig);
    vi.mocked(probeBucketCors).mockResolvedValue({
      ok: false,
      reason: "missing_origin_header",
      warnings: [],
    });

    const session = mock.session({});
    const args = buildActionArgs(adminUser, session, {
      _originalName: "test-connection",
      name: "test-connection",
      ownerScope: "cytario",
      providerType: "aws",
      s3Uri: "mock-bucket",
      bucketRegion: "us-east-1",
      roleArn: "arn:aws:iam::123456789012:role/MyRole",
      bucketEndpoint: "",
    });

    const result = (await updateAction(args as unknown as Parameters<typeof updateAction>[0])) as {
      formError?: string;
      status?: string;
    };

    expect(result.status).toBe("error");
    expect(result.formError).toMatch(/CORS/i);
    expect(prisma.connectionConfig.update).not.toHaveBeenCalled();
  });

  test("re-probes when the endpoint changes and persists with warning on wildcard_origin", async () => {
    vi.mocked(prisma.connectionConfig.findFirst).mockResolvedValue(cytarioConfig);
    vi.mocked(probeBucketCors).mockResolvedValue({
      ok: true,
      warnings: ["wildcard_origin"],
    });
    vi.mocked(prisma.connectionConfig.update).mockResolvedValue({
      ...cytarioConfig,
      bucketName: "mock-bucket",
      region: "us-east-1",
    });

    const session = mock.session({});
    const sessionSet = vi.spyOn(session, "set");
    const args = buildActionArgs(adminUser, session, {
      _originalName: "test-connection",
      name: "test-connection",
      ownerScope: "cytario",
      providerType: "aws",
      s3Uri: "mock-bucket",
      bucketRegion: "us-east-1",
      roleArn: "arn:aws:iam::123456789012:role/MyRole",
      bucketEndpoint: "",
    });

    await updateAction(args as unknown as Parameters<typeof updateAction>[0]);

    expect(prisma.connectionConfig.update).toHaveBeenCalled();
    const notification = sessionSet.mock.calls.find((c) => c[0] === "notification")?.[1] as
      | { status?: string; message?: string }
      | undefined;
    expect(notification?.status).toBe("warning");
    expect(notification?.message).toMatch(/\*/);
  });

  test("skips the probe when neither endpoint nor bucketName changed", async () => {
    // existingConfig: bucketName "mock-bucket", endpoint "https://s3.amazonaws.com",
    // region "us-east-1". Submit the same endpoint + bucket; only the
    // name changes.
    vi.mocked(prisma.connectionConfig.findFirst).mockResolvedValue({
      ...cytarioConfig,
      endpoint: "https://s3.us-east-1.amazonaws.com",
      bucketName: "mock-bucket",
    });
    vi.mocked(prisma.connectionConfig.update).mockResolvedValue({
      ...cytarioConfig,
      name: "renamed",
    });

    const session = mock.session({});
    const args = buildActionArgs(adminUser, session, {
      _originalName: "test-connection",
      name: "renamed",
      ownerScope: "cytario",
      providerType: "aws",
      s3Uri: "mock-bucket",
      bucketRegion: "us-east-1",
      roleArn: "arn:aws:iam::123456789012:role/MyRole",
      bucketEndpoint: "",
    });

    await updateAction(args as unknown as Parameters<typeof updateAction>[0]);

    expect(probeBucketCors).not.toHaveBeenCalled();
    expect(prisma.connectionConfig.update).toHaveBeenCalled();
  });
});
