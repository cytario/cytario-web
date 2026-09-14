import { describe, expect, test, vi } from "vitest";

import { verifyCliToken } from "~/.server/auth/verifyCliToken";
import { getBucketCatalog } from "~/.server/providers/bucketCatalog.server";
import { getProviderCatalog } from "~/.server/providers/providerCatalog.server";
import { loader } from "~/routes/api/me.connections";
import { listConnections } from "~/routes/connections/connections.server";
import mock from "~/utils/__tests__/__mocks__";

vi.mock("~/.server/db/prisma", () => ({ prisma: {} }));
vi.mock("~/.server/db/redis", () => ({ redis: {} }));
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
vi.mock("~/.server/auth/verifyCliToken", () => ({
  verifyCliToken: vi.fn(),
}));
vi.mock("~/routes/connections/connections.server", () => ({
  listConnections: vi.fn(),
}));

const READ_ONLY_ARN = "arn:aws:iam::123456789012:role/cytario/provider-roles/org-ro";
const ADMIN_ARN = "arn:aws:iam::123456789012:role/cytario/provider-roles/internal-admin";

function sharedCatalog() {
  return mock.providerCatalog({
    providerRoles: [
      mock.providerRole({
        roleArn: READ_ONLY_ARN,
        accessLevel: "read-only",
        bucketIds: ["bucket-mock-id"],
      }),
      mock.providerRole({
        roleArn: ADMIN_ARN,
        accessLevel: "admin",
        bucketIds: ["bucket-mock-id"],
      }),
    ],
  });
}

function sharedConnection() {
  return mock.connectionConfig({
    grants: [
      mock.connectionGrant({ scope: "*", accessLevel: "read-only" }),
      mock.connectionGrant({ scope: "org1/internal", accessLevel: "admin" }),
    ],
  });
}

function buildArgs(token: string | null) {
  const headers = new Headers();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return {
    request: new Request("http://localhost/api/me/connections", { headers }),
  } as unknown as Parameters<typeof loader>[0];
}

const cliToken = (overrides: Record<string, unknown> = {}) => ({
  sub: "user-123",
  organization: { org1: { groups: ["org1/internal"] } },
  groups: ["org1/internal"],
  ...overrides,
});

describe("me.connections loader — SRS-CY-419101/419102", () => {
  test("lists connections with the user's most permissive grant", async () => {
    vi.mocked(verifyCliToken).mockResolvedValue(cliToken() as never);
    vi.mocked(listConnections).mockResolvedValue([sharedConnection()]);
    vi.mocked(getProviderCatalog).mockResolvedValue(sharedCatalog());
    vi.mocked(getBucketCatalog).mockResolvedValue(mock.bucketCatalog());

    const response = (await loader(buildArgs("token"))) as Response;
    const body = (await response.json()) as {
      connections: Array<{ roleArn: string | null; accessLevel: string | null }>;
    };

    expect(response.status).toBe(200);
    expect(body.connections).toHaveLength(1);
    expect(body.connections[0]?.roleArn).toBe(ADMIN_ARN);
    expect(body.connections[0]?.accessLevel).toBe("admin");
  });

  test("401 without a Bearer token", async () => {
    const response = (await loader(buildArgs(null))) as Response;
    expect(response.status).toBe(401);
    expect(verifyCliToken).not.toHaveBeenCalled();
  });

  test("401 when the token fails verification", async () => {
    vi.mocked(verifyCliToken).mockResolvedValue(null);
    const response = (await loader(buildArgs("token"))) as Response;
    expect(response.status).toBe(401);
  });

  test("401 when the token carries no single active organization", async () => {
    vi.mocked(verifyCliToken).mockResolvedValue(cliToken({ organization: undefined }) as never);
    const response = (await loader(buildArgs("token"))) as Response;
    expect(response.status).toBe(401);
    expect(listConnections).not.toHaveBeenCalled();
  });

  test("connection with no applicable grant is listed without a role", async () => {
    vi.mocked(verifyCliToken).mockResolvedValue(
      cliToken({ organization: { org1: { groups: ["org1/unrelated"] } } }) as never,
    );
    vi.mocked(listConnections).mockResolvedValue([
      mock.connectionConfig({
        grants: [mock.connectionGrant({ scope: "org1/internal", accessLevel: "admin" })],
      }),
    ]);
    vi.mocked(getProviderCatalog).mockResolvedValue(sharedCatalog());
    vi.mocked(getBucketCatalog).mockResolvedValue(mock.bucketCatalog());

    const response = (await loader(buildArgs("token"))) as Response;
    const body = (await response.json()) as {
      connections: Array<{ roleArn: string | null; accessLevel: string | null }>;
    };

    expect(response.status).toBe(200);
    expect(body.connections[0]?.roleArn).toBeNull();
    expect(body.connections[0]?.accessLevel).toBeNull();
  });

  test("skips a connection whose catalog reference is stale", async () => {
    vi.mocked(verifyCliToken).mockResolvedValue(cliToken() as never);
    vi.mocked(listConnections).mockResolvedValue([sharedConnection()]);
    vi.mocked(getProviderCatalog).mockResolvedValue(
      mock.providerCatalog({
        providerConnections: [],
        providerRoles: [],
      }),
    );
    vi.mocked(getBucketCatalog).mockResolvedValue(mock.bucketCatalog());

    const response = (await loader(buildArgs("token"))) as Response;
    const body = (await response.json()) as { connections: unknown[] };
    expect(response.status).toBe(200);
    expect(body.connections).toHaveLength(0);
  });

  test("502 when the provider catalog lookup fails", async () => {
    vi.mocked(verifyCliToken).mockResolvedValue(cliToken() as never);
    vi.mocked(listConnections).mockResolvedValue([sharedConnection()]);
    vi.mocked(getProviderCatalog).mockRejectedValue(new Error("portal down"));
    vi.mocked(getBucketCatalog).mockResolvedValue(mock.bucketCatalog());

    const response = (await loader(buildArgs("token"))) as Response;

    expect(response.status).toBe(502);
    const body = (await response.json()) as { error: string };
    expect(body.error).toContain("unavailable");
  });

  test("uses the bucket-catalog region over the provider region", async () => {
    vi.mocked(verifyCliToken).mockResolvedValue(cliToken() as never);
    vi.mocked(listConnections).mockResolvedValue([sharedConnection()]);
    vi.mocked(getProviderCatalog).mockResolvedValue(sharedCatalog());
    vi.mocked(getBucketCatalog).mockResolvedValue(
      mock.bucketCatalog({
        buckets: [mock.bucketLookupRow({ bucketName: "mock-bucket", region: "eu-central-1" })],
      }),
    );

    const response = (await loader(buildArgs("token"))) as Response;
    const body = (await response.json()) as { connections: Array<{ region: string }> };
    expect(body.connections[0]?.region).toBe("eu-central-1");
  });
});
