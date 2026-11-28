import { beforeEach, describe, expect, test, vi } from "vitest";

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

const runGatesMock = vi.hoisted(() => vi.fn());
const hasGatesMock = vi.hoisted(() => vi.fn());

vi.mock("~/.server/pluginGates", () => ({
  runGates: runGatesMock,
  hasGates: hasGatesMock,
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
  beforeEach(() => {
    vi.clearAllMocks();
    hasGatesMock.mockReturnValue(false);
  });

  test("lists connections with the user's most permissive grant", async () => {
    vi.mocked(verifyCliToken).mockResolvedValue(cliToken() as never);
    vi.mocked(listConnections).mockResolvedValue([sharedConnection()]);
    vi.mocked(getProviderCatalog).mockResolvedValue(sharedCatalog());
    vi.mocked(getBucketCatalog).mockResolvedValue(mock.bucketCatalog());

    const response = (await loader(buildArgs("the-access-token"))) as Response;
    // The presented token is forwarded to the portal catalog lookup — the
    // portal exchanges it to resolve the org (a tokenless call 401s).
    expect(getProviderCatalog).toHaveBeenCalledWith("org1", "the-access-token");
    const body = (await response.json()) as {
      connections: Array<{
        organization: string;
        id: string;
        roleArn: string | null;
        accessLevel: string | null;
      }>;
    };

    expect(response.status).toBe(200);
    expect(body.connections).toHaveLength(1);
    expect(body.connections[0]?.organization).toBe("org1");
    expect(body.connections[0]?.id).toBe("conn-uuid-1");
    expect(body.connections[0]?.roleArn).toBe(ADMIN_ARN);
    expect(body.connections[0]?.accessLevel).toBe("admin");
  });

  test("rows carry `locked: false` when no gate locked the org's connections", async () => {
    vi.mocked(verifyCliToken).mockResolvedValue(cliToken() as never);
    vi.mocked(listConnections).mockResolvedValue([sharedConnection()]);
    vi.mocked(getProviderCatalog).mockResolvedValue(sharedCatalog());
    vi.mocked(getBucketCatalog).mockResolvedValue(mock.bucketCatalog());

    const response = (await loader(buildArgs("token"))) as Response;
    const body = (await response.json()) as { connections: Array<{ locked: boolean }> };

    expect(body.connections[0]?.locked).toBe(false);
  });

  test("a gate-locked connection is still listed, marked locked", async () => {
    hasGatesMock.mockReturnValue(true);
    runGatesMock.mockResolvedValue({ kind: "lock", connectionIds: ["conn-uuid-1"] });
    vi.mocked(verifyCliToken).mockResolvedValue(cliToken() as never);
    vi.mocked(listConnections).mockResolvedValue([sharedConnection()]);
    vi.mocked(getProviderCatalog).mockResolvedValue(sharedCatalog());
    vi.mocked(getBucketCatalog).mockResolvedValue(mock.bucketCatalog());

    const response = (await loader(buildArgs("token"))) as Response;
    const body = (await response.json()) as {
      connections: Array<{ id: string; locked: boolean }>;
    };

    expect(response.status).toBe(200);
    // Row shape unchanged apart from the flag and the withheld grant: the CLI
    // still sees the row.
    expect(body.connections).toHaveLength(1);
    expect(body.connections[0]?.id).toBe("conn-uuid-1");
    expect(body.connections[0]?.locked).toBe(true);
  });

  test("a locked row withholds the role ARN, access level and STS endpoint", async () => {
    // /api/me/connections sits outside /api/v1/:org, so a Keycloak token alone
    // reaches it. A role ARN here is enough for a client to AssumeRole on its
    // own and read the private bucket the lock refuses.
    hasGatesMock.mockReturnValue(true);
    runGatesMock.mockResolvedValue({ kind: "lock", connectionIds: ["conn-uuid-1"] });
    vi.mocked(verifyCliToken).mockResolvedValue(cliToken() as never);
    vi.mocked(listConnections).mockResolvedValue([sharedConnection()]);
    vi.mocked(getProviderCatalog).mockResolvedValue(sharedCatalog());
    vi.mocked(getBucketCatalog).mockResolvedValue(mock.bucketCatalog());

    const response = (await loader(buildArgs("token"))) as Response;
    const body = (await response.json()) as {
      connections: Array<{
        id: string;
        locked: boolean;
        roleArn: string | null;
        accessLevel: string | null;
        stsEndpoint: string | null;
        region: string;
        s3Endpoint: string;
        bucketName: string;
      }>;
    };

    expect(body.connections[0]).toMatchObject({
      id: "conn-uuid-1",
      locked: true,
      roleArn: null,
      accessLevel: null,
      stsEndpoint: null,
    });
    // The non-secret addressing fields stay, so the CLI can still show the row.
    expect(body.connections[0]?.bucketName).toBeTruthy();
    expect(body.connections[0]?.region).toBeTruthy();
    expect(body.connections[0]?.s3Endpoint).toBeTruthy();
  });

  test("an unlocked row keeps its role ARN in the same response", async () => {
    hasGatesMock.mockReturnValue(true);
    runGatesMock.mockResolvedValue({ kind: "continue" });
    vi.mocked(verifyCliToken).mockResolvedValue(cliToken() as never);
    vi.mocked(listConnections).mockResolvedValue([sharedConnection()]);
    vi.mocked(getProviderCatalog).mockResolvedValue(sharedCatalog());
    vi.mocked(getBucketCatalog).mockResolvedValue(mock.bucketCatalog());

    const response = (await loader(buildArgs("token"))) as Response;
    const body = (await response.json()) as {
      connections: Array<{ locked: boolean; roleArn: string | null; stsEndpoint: string | null }>;
    };

    expect(body.connections[0]?.locked).toBe(false);
    expect(body.connections[0]?.roleArn).toBe(ADMIN_ARN);
    expect(body.connections[0]?.stsEndpoint).toBeTruthy();
  });

  test("a deny on the connection's browse request also marks the row locked", async () => {
    hasGatesMock.mockReturnValue(true);
    runGatesMock.mockResolvedValue({ kind: "deny", status: 402 });
    vi.mocked(verifyCliToken).mockResolvedValue(cliToken() as never);
    vi.mocked(listConnections).mockResolvedValue([sharedConnection()]);
    vi.mocked(getProviderCatalog).mockResolvedValue(sharedCatalog());
    vi.mocked(getBucketCatalog).mockResolvedValue(mock.bucketCatalog());

    const response = (await loader(buildArgs("token"))) as Response;
    const body = (await response.json()) as { connections: Array<{ locked: boolean }> };

    expect(body.connections[0]?.locked).toBe(true);
  });

  test("asks the gate once per connection, naming it and its provider's publicness", async () => {
    hasGatesMock.mockReturnValue(true);
    runGatesMock.mockResolvedValue({ kind: "continue" });
    vi.mocked(verifyCliToken).mockResolvedValue(cliToken() as never);
    vi.mocked(listConnections).mockResolvedValue([sharedConnection()]);
    vi.mocked(getProviderCatalog).mockResolvedValue(sharedCatalog());
    vi.mocked(getBucketCatalog).mockResolvedValue(mock.bucketCatalog());

    await loader(buildArgs("token"));

    expect(runGatesMock).toHaveBeenCalledWith({
      url: "/org1/conn-uuid-1",
      method: "GET",
      identity: expect.objectContaining({ organization: "org1" }),
      resource: { connectionId: "conn-uuid-1", isPublic: false },
    });
  });

  test("asks the gate per organization, not once for the whole read", async () => {
    hasGatesMock.mockReturnValue(true);
    runGatesMock.mockResolvedValue({ kind: "continue" });
    vi.mocked(verifyCliToken).mockResolvedValue(
      cliToken({ organization: { zulu: { groups: [] }, alpha: { groups: [] } } }) as never,
    );
    vi.mocked(listConnections).mockResolvedValue([sharedConnection()]);
    vi.mocked(getProviderCatalog).mockResolvedValue(sharedCatalog());
    vi.mocked(getBucketCatalog).mockResolvedValue(mock.bucketCatalog());

    await loader(buildArgs("token"));

    const gateOrgs = new Set(
      runGatesMock.mock.calls.map(
        ([req]) => (req as { identity: { organization: string } }).identity.organization,
      ),
    );
    expect([...gateOrgs].sort()).toEqual(["alpha", "zulu"]);
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

  test("401 when the token carries no organization", async () => {
    vi.mocked(verifyCliToken).mockResolvedValue(cliToken({ organization: undefined }) as never);
    const response = (await loader(buildArgs("token"))) as Response;
    expect(response.status).toBe(401);
    expect(listConnections).not.toHaveBeenCalled();
  });

  test("lists each org's connections, tagged with their organization", async () => {
    vi.mocked(verifyCliToken).mockResolvedValue(
      cliToken({
        organization: { zulu: { groups: [] }, alpha: { groups: ["alpha/lab"] } },
      }) as never,
    );
    vi.mocked(listConnections).mockImplementation(async (_user, organization) =>
      organization === "alpha"
        ? [
            mock.connectionConfig({
              name: "Alpha Conn",
              organization: "alpha",
              grants: [mock.connectionGrant({ scope: "alpha/lab", accessLevel: "admin" })],
            }),
          ]
        : [
            mock.connectionConfig({
              name: "Zulu Conn",
              organization: "zulu",
              grants: [mock.connectionGrant({ scope: "zulu/lab", accessLevel: "admin" })],
            }),
          ],
    );
    vi.mocked(getProviderCatalog).mockImplementation(async (organization) =>
      organization === "alpha" ? sharedCatalog() : mock.providerCatalog({ providerRoles: [] }),
    );
    vi.mocked(getBucketCatalog).mockResolvedValue(mock.bucketCatalog());

    const response = await loader(buildArgs("token"));
    const body = (await response.json()) as {
      connections: Array<{ organization: string; name: string; roleArn: string | null }>;
    };

    expect(response.status).toBe(200);
    // Grants resolve per org: the alpha row's org grants apply, the zulu
    // row's do not. Only a subset is pinned — the row shape is covered by
    // the full-row test above.
    expect(body.connections).toMatchObject([
      {
        organization: "alpha",
        name: "Alpha Conn",
        roleArn: ADMIN_ARN,
        accessLevel: "admin",
      },
      {
        organization: "zulu",
        name: "Zulu Conn",
        roleArn: null,
        accessLevel: null,
      },
    ]);
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

  test("a public connection lists with a null roleArn and read-only access", async () => {
    vi.mocked(verifyCliToken).mockResolvedValue(cliToken() as never);
    vi.mocked(listConnections).mockResolvedValue([
      mock.connectionConfig({
        grants: [mock.connectionGrant({ scope: "*", accessLevel: "read-only" })],
      }),
    ]);
    vi.mocked(getProviderCatalog).mockResolvedValue(
      mock.providerCatalog({
        providerConnections: [mock.providerConnection({ id: "pc-mock", isPublic: true })],
        providerRoles: [],
      }),
    );
    vi.mocked(getBucketCatalog).mockResolvedValue(mock.bucketCatalog());

    const response = (await loader(buildArgs("token"))) as Response;
    const body = (await response.json()) as {
      connections: Array<{ roleArn: string | null; accessLevel: string | null }>;
    };

    expect(response.status).toBe(200);
    // The synthesized grant is ARN-less: the CLI fails closed on it.
    expect(body.connections[0]?.roleArn).toBeNull();
    expect(body.connections[0]?.accessLevel).toBe("read-only");
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
