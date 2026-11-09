import { beforeEach, describe, expect, test, vi } from "vitest";

import { authContext } from "~/.server/auth/authMiddleware";
import { exchangePortalAccessToken } from "~/.server/auth/orgTokenExchange";
import { getProviderCatalog } from "~/.server/providers/providerCatalog.server";
import { loader } from "~/routes/api/provider-catalog";
import mock from "~/utils/__tests__/__mocks__";

vi.mock("~/.server/db/prisma", () => ({ prisma: {} }));
vi.mock("~/.server/db/redis", () => ({ redis: {} }));
vi.mock("~/.server/auth/orgTokenExchange", async () =>
  (await import("~/utils/__tests__/orgTokenExchangeMock")).orgTokenExchangeMocks(),
);

vi.mock("~/.server/providers/providerCatalog.server", async () => {
  const actual = await vi.importActual<typeof import("~/.server/providers/providerCatalog.server")>(
    "~/.server/providers/providerCatalog.server",
  );
  return { ...actual, getProviderCatalog: vi.fn() };
});

function buildArgs(
  user: ReturnType<typeof mock.user>,
  requestOrganization: string | undefined = Object.keys(user.organizations)[0],
) {
  const ctx = new Map<unknown, unknown>();
  ctx.set(authContext, {
    user,
    requestOrganization,
    sessionId: "session-1",
    authTokens: { accessToken: "test-token", idToken: "test-id" },
  });
  return {
    request: new Request(
      `http://localhost/api/v1/${requestOrganization ?? "org"}/provider-catalog`,
    ),
    params: {},
    context: { get: (k: unknown) => ctx.get(k), set: (k: unknown, v: unknown) => ctx.set(k, v) },
  } as unknown as Parameters<typeof loader>[0];
}

/** A user whose token carries two memberships, pointed at `org1`. */
function multiOrgUser() {
  return mock.user({
    organizations: {
      org1: { groups: ["org1/lab"], attributes: {} },
      zeta: { groups: ["zeta/lab"], attributes: {} },
    },
  });
}

beforeEach(() => {
  vi.mocked(exchangePortalAccessToken).mockClear();
  vi.mocked(getProviderCatalog).mockReset();
});

describe("provider-catalog loader", () => {
  test("SECURITY: the response never carries a role ARN", async () => {
    vi.mocked(getProviderCatalog).mockResolvedValue(
      mock.providerCatalog({
        providerRoles: [
          mock.providerRole({ roleArn: "arn:aws:iam::123456789012:role/secret-role" }),
        ],
      }),
    );

    const response = (await loader(buildArgs(mock.user()))) as Response;
    const body = await response.text();

    expect(body).not.toContain("arn:aws:iam");
    expect(body).not.toContain("secret-role");
    expect(body).not.toContain("roleArn");
  });

  test("ships the selector-relevant role fields", async () => {
    vi.mocked(getProviderCatalog).mockResolvedValue(mock.providerCatalog());

    const response = (await loader(buildArgs(mock.user()))) as Response;
    const { catalog } = (await response.json()) as {
      catalog: { providerRoles: Record<string, unknown>[] };
    };

    expect(catalog.providerRoles[0]).toEqual({
      providerConnectionId: "pc-mock",
      allowedScopes: ["lab"],
      accessLevel: "read-only",
      bucketIds: [],
    });
  });

  test("is marked non-cacheable", async () => {
    vi.mocked(getProviderCatalog).mockResolvedValue(mock.providerCatalog());
    const response = (await loader(buildArgs(mock.user()))) as Response;
    expect(response.headers.get("Cache-Control")).toBe("no-store, private");
  });

  test("degrades to { error } with 200 when the catalog is unavailable", async () => {
    vi.mocked(getProviderCatalog).mockRejectedValue(new Error("catalog down"));
    const response = (await loader(buildArgs(mock.user()))) as Response;
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ error: "catalog down" });
  });

  test("answers { error } when the session has no active organization", async () => {
    const response = (await loader(buildArgs(mock.user({ organizations: {} })))) as Response;
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ error: "No active organization." });
  });

  test("the URL org's membership resolves that org's token exchange and catalog", async () => {
    vi.mocked(getProviderCatalog).mockResolvedValue(mock.providerCatalog());

    const response = (await loader(buildArgs(multiOrgUser(), "zeta"))) as Response;
    const body = await response.json();

    expect(exchangePortalAccessToken).toHaveBeenCalledWith("session-1", "zeta", "test-token");
    expect(getProviderCatalog).toHaveBeenCalledWith("zeta", "narrow-access:zeta");
    expect(body).toHaveProperty("catalog");
  });

  test("a multi-membership user acts in the request org the middleware resolved", async () => {
    vi.mocked(getProviderCatalog).mockResolvedValue(mock.providerCatalog());

    const response = (await loader(buildArgs(multiOrgUser(), "org1"))) as Response;

    expect(response.status).toBe(200);
    expect(exchangePortalAccessToken).toHaveBeenCalledWith("session-1", "org1", "test-token");
    expect(getProviderCatalog).toHaveBeenCalledWith("org1", "narrow-access:org1");
    expect(await response.json()).toHaveProperty("catalog");
  });
});
