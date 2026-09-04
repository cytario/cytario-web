import { describe, expect, test, vi } from "vitest";

import { authContext } from "~/.server/auth/authMiddleware";
import { getProviderCatalog } from "~/.server/providers/providerCatalog.server";
import { loader } from "~/routes/api/cyberduck-profile.$id";
import { getConnection } from "~/routes/connections/connections.server";
import mock from "~/utils/__tests__/__mocks__";

vi.mock("~/.server/db/prisma", () => ({ prisma: {} }));
vi.mock("~/.server/db/redis", () => ({ redis: {} }));
vi.mock("~/.server/providers/providerCatalog.server", async () => {
  const actual = await vi.importActual<typeof import("~/.server/providers/providerCatalog.server")>(
    "~/.server/providers/providerCatalog.server",
  );
  return { ...actual, getProviderCatalog: vi.fn() };
});
vi.mock("~/routes/connections/connections.server", () => ({
  getConnection: vi.fn(),
}));
vi.mock("~/config", () => ({
  cytarioConfig: {
    auth: {
      baseUrl: "http://localhost:8080/realms/master",
      cyberduckClientId: "cyberduck-client",
      scopes: ["openid", "profile"],
    },
    endpoints: { webapp: "https://cytario.example.com" },
  },
}));

const READ_ONLY_ARN = "arn:aws:iam::123456789012:role/cytario/provider-roles/org-ro";
const ADMIN_ARN = "arn:aws:iam::123456789012:role/cytario/provider-roles/internal-admin";
const ANNOTATE_ARN = "arn:aws:iam::123456789012:role/cytario/provider-roles/lab-an";
const READ_WRITE_ARN = "arn:aws:iam::123456789012:role/cytario/provider-roles/lab-rw";

/** The DEV-fixture shape from C-435: org-root read-only grant + internal-group admin grant. */
function sharedCatalog() {
  return mock.providerCatalog({
    providerRoles: [
      mock.providerRole({ id: "pr-ro", roleArn: READ_ONLY_ARN, accessLevel: "read-only" }),
      mock.providerRole({ id: "pr-admin", roleArn: ADMIN_ARN, accessLevel: "admin" }),
    ],
  });
}

function sharedConnection() {
  return mock.connectionConfig({
    grants: [
      mock.connectionGrant({ scope: "*", providerRoleId: "pr-ro" }),
      mock.connectionGrant({ scope: "org1/internal", providerRoleId: "pr-admin" }),
    ],
  });
}

function buildArgs(user: ReturnType<typeof mock.user>, connectionId = "conn-uuid-1") {
  const ctx = new Map<unknown, unknown>();
  ctx.set(authContext, { user, authTokens: { accessToken: "t", idToken: "t" } });
  return {
    request: new Request(`http://localhost/api/cyberduck-profile/${connectionId}`),
    params: { id: connectionId },
    context: { get: (k: unknown) => ctx.get(k), set: (k: unknown, v: unknown) => ctx.set(k, v) },
  } as unknown as Parameters<typeof loader>[0];
}

function rolearnOf(profileXml: string): string | undefined {
  return profileXml
    .split("<key>s3.assumerole.rolearn</key>")[1]
    ?.split("<string>")[1]
    ?.split("</string>")[0];
}

describe("cyberduck-profile loader — SRS-CY-43111", () => {
  test("C-435 regression: member of the admin-granted group gets the admin role, not grants[0]", async () => {
    vi.mocked(getConnection).mockResolvedValue(sharedConnection());
    vi.mocked(getProviderCatalog).mockResolvedValue(sharedCatalog());
    // grants[0] is the org-root read-only grant; the user must still get admin.
    const user = mock.user({ groups: ["org1/internal"], adminScopes: [] });

    const response = (await loader(buildArgs(user))) as Response;

    expect(response.status).toBe(200);
    expect(rolearnOf(await response.text())).toBe(ADMIN_ARN);
  });

  test("plain org member (org-root grant only applicable) gets the read-only role", async () => {
    vi.mocked(getConnection).mockResolvedValue(sharedConnection());
    vi.mocked(getProviderCatalog).mockResolvedValue(sharedCatalog());
    const user = mock.user({ groups: [], adminScopes: [] });

    const response = (await loader(buildArgs(user))) as Response;

    expect(response.status).toBe(200);
    expect(rolearnOf(await response.text())).toBe(READ_ONLY_ARN);
  });

  test("member of several granted groups gets the highest access level's role", async () => {
    vi.mocked(getConnection).mockResolvedValue(
      mock.connectionConfig({
        grants: [
          mock.connectionGrant({ scope: "org1/annotate-team", providerRoleId: "pr-an" }),
          mock.connectionGrant({ scope: "org1/rw-team", providerRoleId: "pr-rw" }),
        ],
      }),
    );
    vi.mocked(getProviderCatalog).mockResolvedValue(
      mock.providerCatalog({
        providerRoles: [
          mock.providerRole({ id: "pr-an", roleArn: ANNOTATE_ARN, accessLevel: "annotate" }),
          mock.providerRole({ id: "pr-rw", roleArn: READ_WRITE_ARN, accessLevel: "read-write" }),
        ],
      }),
    );
    const user = mock.user({
      groups: ["org1/annotate-team", "org1/rw-team"],
      adminScopes: [],
    });

    const response = (await loader(buildArgs(user))) as Response;

    expect(response.status).toBe(200);
    expect(rolearnOf(await response.text())).toBe(READ_WRITE_ARN);
  });

  test("user with no applicable grant is refused with 403 and no XML", async () => {
    // The connection stays visible via its grant scope (getConnection canSee),
    // but the only grant references a provider role absent from the catalog —
    // it resolves to nothing, so no applicable grant remains for the user.
    vi.mocked(getConnection).mockResolvedValue(
      mock.connectionConfig({
        grants: [mock.connectionGrant({ scope: "org1/internal", providerRoleId: "pr-stale" })],
      }),
    );
    vi.mocked(getProviderCatalog).mockResolvedValue(
      mock.providerCatalog({
        providerRoles: [mock.providerRole({ id: "pr-ro", roleArn: READ_ONLY_ARN })],
      }),
    );
    const user = mock.user({ groups: ["org1/internal"], adminScopes: [] });

    const response = (await loader(buildArgs(user))) as Response;

    expect(response.status).toBe(403);
    expect(await response.text()).toBe(
      "You are not a member of any group granted access to this connection.",
    );
  });

  test("catalog lookup failure degrades to 502", async () => {
    vi.mocked(getConnection).mockResolvedValue(sharedConnection());
    vi.mocked(getProviderCatalog).mockRejectedValue(new Error("catalog down"));

    const response = (await loader(buildArgs(mock.user()))) as Response;

    expect(response.status).toBe(502);
  });

  test("connection not visible to the user is 404", async () => {
    vi.mocked(getConnection).mockResolvedValue(null);

    const response = (await loader(buildArgs(mock.user()))) as Response;

    expect(response.status).toBe(404);
  });
});
