import { beforeEach, describe, expect, test, vi } from "vitest";

import { CONNECTIONS_API_SECRET_HEADER } from "~/.server/connections/connectionsApiAuth.server";
import { createConnectionWithCatalogValidation } from "~/.server/connections/createConnection.server";
import { prisma } from "~/.server/db/prisma";
import { action, loader } from "~/routes/api/connections";
import { applyGrantsAndRecordStatus } from "~/routes/connections/connectionGrant.server";
import mock from "~/utils/__tests__/__mocks__";

const SECRET = "test-connections-secret";

vi.mock("~/.server/db/prisma", () => ({
  prisma: {
    connectionConfig: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));
vi.mock("~/.server/db/redis", () => ({ redis: {} }));

// The shared apply module is mocked so the demo-path test can assert it is
// never called; the create core is mocked so the catalog path is exercised
// via the mocked createConnectionWithCatalogValidation in the other tests.
vi.mock("~/.server/connections/createConnection.server", async () => {
  const actual = await vi.importActual<
    typeof import("~/.server/connections/createConnection.server")
  >("~/.server/connections/createConnection.server");
  return {
    ...actual,
    createConnectionWithCatalogValidation: vi.fn(),
  };
});
vi.mock("~/routes/connections/connectionGrant.server", () => ({
  applyGrantsAndRecordStatus: vi.fn(),
  validateBucketRef: vi.fn(),
  validateProviderRefs: vi.fn(),
}));
// Resolve every org by default so the happy-path tests pass; individual
// tests override the return for the unknown-alias case.
vi.mock("~/.server/auth/keycloakAdmin", () => ({
  findOrganizationByAlias: vi.fn(async (alias: string) => ({
    id: `kc-${alias}`,
    name: alias,
    alias,
  })),
}));

function buildArgs(
  request: Request,
  contextData?: Record<string, unknown>,
): Parameters<typeof action>[0] {
  const ctx = new Map<unknown, unknown>(Object.entries(contextData ?? {}));
  return {
    request,
    params: {},
    context: { get: (k: unknown) => ctx.get(k), set: (k: unknown, v: unknown) => ctx.set(k, v) },
  } as unknown as Parameters<typeof action>[0];
}

function postRequest(payload: unknown, secret = SECRET): Request {
  return new Request("http://localhost/api/connections", {
    method: "POST",
    headers: { "Content-Type": "application/json", [CONNECTIONS_API_SECRET_HEADER]: secret },
    body: JSON.stringify(payload),
  });
}

const validPayload = {
  organization: "org1",
  name: "DEMO bucket",
  providerConnectionId: "pc-mock",
  bucketName: "demo-bucket",
  prefix: "",
  grants: [{ scope: "org1", accessLevel: "read-only" }],
  managedExternally: true,
};

const createdConnection = mock.connectionConfig({
  organization: "org1",
  bucketName: "demo-bucket",
  bucketPolicyStatus: "externally_managed",
});

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CONNECTIONS_API_SECRET = SECRET;
  process.env.CONNECTIONS_API_MANAGED_BUCKETS = "demo-bucket";
});

describe("auth", () => {
  test("401 when the secret header is missing", async () => {
    delete process.env.CONNECTIONS_API_SECRET;
    const request = new Request("http://localhost/api/connections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validPayload),
    });
    const response = await action(buildArgs(request));
    expect(response.status).toBe(401);
    expect(createConnectionWithCatalogValidation).not.toHaveBeenCalled();
  });

  test("401 when the secret is wrong", async () => {
    const response = await action(buildArgs(postRequest(validPayload, "wrong")));
    expect(response.status).toBe(401);
    expect(createConnectionWithCatalogValidation).not.toHaveBeenCalled();
  });

  test("401 on GET when the secret is missing", async () => {
    delete process.env.CONNECTIONS_API_SECRET;
    const response = await loader(buildArgs(new Request("http://localhost/api/connections")));
    expect(response.status).toBe(401);
  });

  test("GET list passes with the correct secret", async () => {
    const request = new Request("http://localhost/api/connections?org=org1", {
      headers: { [CONNECTIONS_API_SECRET_HEADER]: SECRET },
    });
    vi.mocked(prisma.connectionConfig.findMany).mockResolvedValue([] as never);
    const response = await loader(buildArgs(request));
    expect(response.status).toBe(200);
  });
});

describe("create", () => {
  test("creates with 201, organization from payload, createdBy admin-portal", async () => {
    vi.mocked(createConnectionWithCatalogValidation).mockResolvedValue({
      ok: true,
      created: true,
      connection: createdConnection,
    } as never);

    const response = await action(buildArgs(postRequest(validPayload)));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.created).toBe(true);
    expect(body.connection.bucketName).toBe("demo-bucket");
    expect(createConnectionWithCatalogValidation).toHaveBeenCalledWith(
      "org1",
      "admin-portal",
      expect.objectContaining({ name: "DEMO bucket" }),
      "",
      // Skip catalog re-validation (portal already resolved the references)
      // and record the externally-managed status atomically with the create.
      {
        skipCatalogValidation: true,
        initialBucketPolicyStatus: "externally_managed",
      },
    );
  });

  test("demo path (managedExternally) never runs the bucket-policy apply", async () => {
    vi.mocked(createConnectionWithCatalogValidation).mockResolvedValue({
      ok: true,
      created: true,
      connection: createdConnection,
    } as never);

    await action(buildArgs(postRequest(validPayload)));

    // The apply step of the form action is never invoked by the API path, and
    // the externally-managed status is passed into the create (atomic) rather
    // than patched onto the row afterwards.
    expect(applyGrantsAndRecordStatus).not.toHaveBeenCalled();
    expect(prisma.connectionConfig.update).not.toHaveBeenCalled();
  });

  test("unknown organization alias is a 422 before any write", async () => {
    const { findOrganizationByAlias } = await import("~/.server/auth/keycloakAdmin");
    vi.mocked(findOrganizationByAlias).mockResolvedValueOnce(undefined);

    const response = await action(buildArgs(postRequest(validPayload)));
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error).toContain("Unknown organization");
    expect(createConnectionWithCatalogValidation).not.toHaveBeenCalled();
  });

  test("managedExternally on a bucket outside the managed allowlist is a 422", async () => {
    process.env.CONNECTIONS_API_MANAGED_BUCKETS = "other-bucket";
    const response = await action(buildArgs(postRequest(validPayload)));
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error).toContain("not a platform-managed bucket");
    expect(createConnectionWithCatalogValidation).not.toHaveBeenCalled();
  });

  test("unset managed allowlist rejects every managedExternally create", async () => {
    delete process.env.CONNECTIONS_API_MANAGED_BUCKETS;
    const response = await action(buildArgs(postRequest(validPayload)));
    expect(response.status).toBe(422);
    expect(createConnectionWithCatalogValidation).not.toHaveBeenCalled();
  });

  test("idempotent conflict returns 200 with created: false", async () => {
    vi.mocked(createConnectionWithCatalogValidation).mockResolvedValue({
      ok: true,
      created: false,
      connection: createdConnection,
    } as never);

    const response = await action(buildArgs(postRequest(validPayload)));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.created).toBe(false);
    expect(body.connection.id).toBe(createdConnection.id);
    // A retry must not re-record the status on the existing row.
    expect(prisma.connectionConfig.update).not.toHaveBeenCalled();
  });

  test("zod failures map to 400 with field errors", async () => {
    const response = await action(buildArgs(postRequest({ ...validPayload, name: "x" })));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Validation failed");
    expect(body.fields.name).toBeDefined();
    expect(createConnectionWithCatalogValidation).not.toHaveBeenCalled();
  });

  test("missing organization in the payload is a 400", async () => {
    const withoutOrg: Record<string, unknown> = { ...validPayload };
    delete withoutOrg.organization;
    const response = await action(buildArgs(postRequest(withoutOrg)));
    expect(response.status).toBe(400);
    expect(createConnectionWithCatalogValidation).not.toHaveBeenCalled();
  });

  test("catalog rejection maps to 422 with the catalog message", async () => {
    vi.mocked(createConnectionWithCatalogValidation).mockResolvedValue({
      ok: false,
      error: "catalog",
      message: "Provider catalog is unavailable.",
    } as never);

    const response = await action(buildArgs(postRequest(validPayload)));
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error).toBe("Provider catalog is unavailable.");
  });

  test("invalid JSON body is a 400", async () => {
    const request = new Request("http://localhost/api/connections", {
      method: "POST",
      headers: { "Content-Type": "application/json", [CONNECTIONS_API_SECRET_HEADER]: SECRET },
      body: "not json",
    });
    const response = await action(buildArgs(request));
    expect(response.status).toBe(400);
  });
});

describe("list", () => {
  test("scopes the query to the org query parameter", async () => {
    vi.mocked(prisma.connectionConfig.findMany).mockResolvedValue([createdConnection] as never);

    const response = await loader(
      buildArgs(
        new Request("http://localhost/api/connections?org=org1", {
          headers: { [CONNECTIONS_API_SECRET_HEADER]: SECRET },
        }),
      ),
    );
    expect(response.status).toBe(200);
    expect(prisma.connectionConfig.findMany).toHaveBeenCalledWith({
      where: { organization: "org1" },
      include: { grants: true },
    });
    const body = await response.json();
    expect(body.connections).toHaveLength(1);
    expect(body.connections[0].bucketPolicyStatus).toBe("externally_managed");
  });

  test("never returns another org's connections", async () => {
    vi.mocked(prisma.connectionConfig.findMany).mockResolvedValue([] as never);
    await loader(
      buildArgs(
        new Request("http://localhost/api/connections?org=other-org", {
          headers: { [CONNECTIONS_API_SECRET_HEADER]: SECRET },
        }),
      ),
    );
    expect(prisma.connectionConfig.findMany).toHaveBeenCalledWith({
      where: { organization: "other-org" },
      include: { grants: true },
    });
  });

  test("missing org query parameter is a 400", async () => {
    const response = await loader(
      buildArgs(
        new Request("http://localhost/api/connections", {
          headers: { [CONNECTIONS_API_SECRET_HEADER]: SECRET },
        }),
      ),
    );
    expect(response.status).toBe(400);
  });

  test("the list response never contains grants' raw rows beyond scope + level", async () => {
    vi.mocked(prisma.connectionConfig.findMany).mockResolvedValue([createdConnection] as never);
    const response = await loader(
      buildArgs(
        new Request("http://localhost/api/connections?org=org1", {
          headers: { [CONNECTIONS_API_SECRET_HEADER]: SECRET },
        }),
      ),
    );
    const body = await response.json();
    const serialized = JSON.stringify(body);
    expect(serialized).toContain('"scope"');
    expect(serialized).not.toContain("roleArn");
    expect(serialized).not.toContain("endpoint");
  });
});
