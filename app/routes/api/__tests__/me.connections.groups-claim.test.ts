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
const BUCKET_ID = "bucket-mock-id";

function orgScopedCatalog() {
  return mock.providerCatalog({
    providerRoles: [
      mock.providerRole({
        roleArn: READ_ONLY_ARN,
        accessLevel: "read-only",
        bucketIds: [BUCKET_ID],
      }),
    ],
  });
}

function orgScopedConnection() {
  return mock.connectionConfig({
    grants: [mock.connectionGrant({ scope: "org1/lab", accessLevel: "read-only" })],
  });
}

function buildArgs(token: string) {
  const headers = new Headers();
  headers.set("Authorization", `Bearer ${token}`);
  return {
    request: new Request("http://localhost/api/me/connections", { headers }),
  } as unknown as Parameters<typeof loader>[0];
}

describe("me.connections loader — SRS-CY-419103 groups claim", () => {
  test("a token without a groups claim yields no visible grant", async () => {
    // The Keycloak client must carry the groups membership mapper; without
    // it the token's groups claim is absent and every connection resolves to
    // no applicable grant.
    vi.mocked(verifyCliToken).mockResolvedValue({
      sub: "user-123",
      organization: { org1: { groups: ["org1/lab"] } },
      // no `groups` claim on the token
    } as never);
    vi.mocked(listConnections).mockResolvedValue([orgScopedConnection()]);
    vi.mocked(getProviderCatalog).mockResolvedValue(orgScopedCatalog());
    vi.mocked(getBucketCatalog).mockResolvedValue(mock.bucketCatalog());

    const response = (await loader(buildArgs("token"))) as Response;
    const body = (await response.json()) as {
      connections: Array<{ roleArn: string | null }>;
    };

    expect(response.status).toBe(200);
    expect(body.connections[0]?.roleArn).toBeNull();
  });
});
