import { catalogFetch } from "../catalogFetch";
import { hostRequestStorage, type HostRequestData } from "../hostRequestContext";
import type { ProviderCatalog } from "~/utils/providerCatalog.schema";

const { getProviderCatalogMock } = vi.hoisted(() => ({
  getProviderCatalogMock: vi.fn(),
}));

vi.mock("~/.server/providers/providerCatalog.server", () => ({
  getProviderCatalog: getProviderCatalogMock,
}));

const mockRequestData: HostRequestData = {
  user: {
    sub: "user-123",
    organization: "testcorp",
    organizationAttributes: {},
    groups: [],
    adminScopes: [],
  } as never,
  identity: undefined,
  authTokens: { accessToken: "access", refreshToken: "refresh", idToken: "id" },
  sessionId: "session-123",
};

const catalogWith = (over: Record<string, unknown> = {}) => ({
  id: "ac-1",
  displayName: "Harbor",
  registryEndpoint: "https://harbor.example.com",
  namespace: "cytario",
  accessAccountId: "robot$harbor",
  accessAccountSecret: "secret-token",
  enabled: true,
  status: "connected" as const,
  registryKind: "harbor" as const,
  allowedGroups: [],
  ...over,
});

const providerCatalogWith = (appCatalog: unknown): ProviderCatalog =>
  ({
    providerConnections: [],
    providerRoles: [],
    computeProviders: [],
    computeRoles: [],
    appCatalogs: [appCatalog],
  }) as ProviderCatalog;

const providerCatalogWithTwo = (first: unknown, second: unknown): ProviderCatalog =>
  ({
    providerConnections: [],
    providerRoles: [],
    computeProviders: [],
    computeRoles: [],
    appCatalogs: [first, second],
  }) as ProviderCatalog;

const fetchCalls: Array<{ url: string; init?: RequestInit }> = [];

function stubFetch(respond: () => Response) {
  fetchCalls.length = 0;
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    fetchCalls.push({ url, init });
    return respond();
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("catalogFetch — credential attachment (SRS-CY-414102)", () => {
  test("attaches Basic Authorization for a credentialed catalog", async () => {
    getProviderCatalogMock.mockResolvedValue(providerCatalogWith(catalogWith()));
    stubFetch(
      () =>
        new Response("{}", {
          headers: { "content-type": "application/json" },
        }),
    );

    await hostRequestStorage.run(mockRequestData, () =>
      catalogFetch("Harbor", "https://harbor.example.com/v2/_catalog"),
    );

    expect(fetchCalls).toHaveLength(1);
    const headers = fetchCalls[0].init?.headers as Record<string, string>;
    const expected = `Basic ${Buffer.from("robot$harbor:secret-token").toString("base64")}`;
    expect(headers.Authorization).toBe(expected);
  });

  test("omits the Authorization header ENTIRELY for a credential-less catalog (AC2)", async () => {
    getProviderCatalogMock.mockResolvedValue(
      providerCatalogWith(
        catalogWith({ accessAccountId: undefined, accessAccountSecret: undefined }),
      ),
    );
    stubFetch(
      () =>
        new Response("{}", {
          headers: { "content-type": "application/json" },
        }),
    );

    await hostRequestStorage.run(mockRequestData, () =>
      catalogFetch("Harbor", "https://harbor.example.com/v2/_catalog"),
    );

    expect(fetchCalls).toHaveLength(1);
    const headers = fetchCalls[0].init?.headers as Record<string, string>;
    // No Authorization key AT ALL — not an empty value, not `Basic Og==`.
    expect(headers.Authorization).toBeUndefined();
    expect(headers.authorization).toBeUndefined();
    expect(Object.keys(headers)).not.toContain("Authorization");
  });

  test("a credential pair with one empty field is treated as credential-less (no partial Basic)", async () => {
    getProviderCatalogMock.mockResolvedValue(
      providerCatalogWith(
        catalogWith({ accessAccountId: "robot$harbor", accessAccountSecret: "" }),
      ),
    );
    stubFetch(
      () =>
        new Response("{}", {
          headers: { "content-type": "application/json" },
        }),
    );

    await hostRequestStorage.run(mockRequestData, () =>
      catalogFetch("Harbor", "https://harbor.example.com/v2/"),
    );

    const headers = fetchCalls[0].init?.headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
  });

  test("forwards the plugin's own headers (e.g. the manifest Accept) untouched", async () => {
    getProviderCatalogMock.mockResolvedValue(providerCatalogWith(catalogWith()));
    stubFetch(
      () =>
        new Response("{}", {
          headers: { "content-type": "application/json" },
        }),
    );

    await hostRequestStorage.run(mockRequestData, () =>
      catalogFetch("Harbor", "https://harbor.example.com/v2/x/manifests/1.0.0", {
        headers: { Accept: "application/vnd.oci.image.manifest.v1+json" },
      }),
    );

    const headers = fetchCalls[0].init?.headers as Record<string, string>;
    expect(headers.Accept).toBe("application/vnd.oci.image.manifest.v1+json");
    expect(headers.Authorization).toMatch(/^Basic /);
  });
});

describe("catalogFetch — multiple catalogs", () => {
  test("name resolution picks the right catalog among two connected ones", async () => {
    getProviderCatalogMock.mockResolvedValue(
      providerCatalogWithTwo(
        catalogWith(),
        catalogWith({
          id: "ac-2",
          displayName: "Dev Harbor",
          registryEndpoint: "https://dev-harbor.example.com",
          accessAccountId: "robot$dev",
          accessAccountSecret: "dev-secret",
        }),
      ),
    );
    stubFetch(
      () =>
        new Response("{}", {
          headers: { "content-type": "application/json" },
        }),
    );

    await hostRequestStorage.run(mockRequestData, () =>
      catalogFetch("Dev Harbor", "https://dev-harbor.example.com/v2/_catalog"),
    );

    expect(fetchCalls).toHaveLength(1);
    const headers = fetchCalls[0].init?.headers as Record<string, string>;
    const expected = `Basic ${Buffer.from("robot$dev:dev-secret").toString("base64")}`;
    expect(headers.Authorization).toBe(expected);
  });

  test("a credential-less catalog among credentialed ones still emits no Authorization", async () => {
    getProviderCatalogMock.mockResolvedValue(
      providerCatalogWithTwo(
        catalogWith(),
        catalogWith({
          id: "ac-public",
          displayName: "Public OCI",
          registryEndpoint: "https://registry.example.com",
          registryKind: "oci-catalog",
          accessAccountId: undefined,
          accessAccountSecret: undefined,
        }),
      ),
    );
    stubFetch(
      () =>
        new Response("{}", {
          headers: { "content-type": "application/json" },
        }),
    );

    await hostRequestStorage.run(mockRequestData, () =>
      catalogFetch("Public OCI", "https://registry.example.com/v2/_catalog"),
    );

    expect(fetchCalls).toHaveLength(1);
    const headers = fetchCalls[0].init?.headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
    expect(Object.keys(headers)).not.toContain("Authorization");
  });

  test("the other catalog's credential is never attached to a cross-catalog name", async () => {
    getProviderCatalogMock.mockResolvedValue(
      providerCatalogWithTwo(
        catalogWith(),
        catalogWith({
          id: "ac-2",
          displayName: "Dev Harbor",
          registryEndpoint: "https://dev-harbor.example.com",
          accessAccountId: "robot$dev",
          accessAccountSecret: "dev-secret",
        }),
      ),
    );
    stubFetch(
      () =>
        new Response("{}", {
          headers: { "content-type": "application/json" },
        }),
    );

    await hostRequestStorage.run(mockRequestData, () =>
      catalogFetch("Harbor", "https://harbor.example.com/v2/_catalog"),
    );

    const headers = fetchCalls[0].init?.headers as Record<string, string>;
    const expected = `Basic ${Buffer.from("robot$harbor:secret-token").toString("base64")}`;
    expect(headers.Authorization).toBe(expected);
    const devCredential = `Basic ${Buffer.from("robot$dev:dev-secret").toString("base64")}`;
    expect(headers.Authorization).not.toBe(devCredential);
  });
});

describe("catalogFetch — SSRF guard", () => {
  test("assertSameOrigin still throws for a cross-origin request", async () => {
    getProviderCatalogMock.mockResolvedValue(providerCatalogWith(catalogWith()));
    // The registry answers 200; the guard must reject BEFORE any fetch.
    stubFetch(
      () =>
        new Response("{}", {
          headers: { "content-type": "application/json" },
        }),
    );

    await expect(
      hostRequestStorage.run(mockRequestData, () =>
        catalogFetch("Harbor", "https://evil.example.com/v2/_catalog"),
      ),
    ).rejects.toThrow(/egress violation/);
    expect(fetchCalls).toHaveLength(0);
  });

  test("the guard stays origin-equality — a different-origin registry kind gets no widening", async () => {
    getProviderCatalogMock.mockResolvedValue(
      providerCatalogWith(
        catalogWith({
          registryEndpoint: "https://registry.example.com",
          registryKind: "oci-catalog",
          accessAccountId: undefined,
          accessAccountSecret: undefined,
        }),
      ),
    );
    stubFetch(
      () =>
        new Response("{}", {
          headers: { "content-type": "application/json" },
        }),
    );

    // api.github.com is a different origin, so oci-catalog must not widen the
    // guard (SDS-CY-010097).
    await expect(
      hostRequestStorage.run(mockRequestData, () =>
        catalogFetch("Harbor", "https://api.github.com/orgs/x/packages"),
      ),
    ).rejects.toThrow(/egress violation/);
  });
});

describe("catalogFetch — response stripping (the plugin never sees the credential)", () => {
  test("the response Authorization header is stripped", async () => {
    getProviderCatalogMock.mockResolvedValue(providerCatalogWith(catalogWith()));
    stubFetch(
      () =>
        new Response("{}", {
          headers: {
            "content-type": "application/json",
            Authorization: "Bearer server-side-token",
          },
        }),
    );

    const response = await hostRequestStorage.run(mockRequestData, () =>
      catalogFetch("Harbor", "https://harbor.example.com/v2/"),
    );

    expect(response.headers.get("Authorization")).toBeNull();
    expect(response.headers.get("authorization")).toBeNull();
  });
});

describe("catalogFetch — connection resolution", () => {
  test("throws for an unknown / disabled / non-connected catalog name", async () => {
    getProviderCatalogMock.mockResolvedValue(providerCatalogWith(catalogWith({ enabled: false })));

    await expect(
      hostRequestStorage.run(mockRequestData, () =>
        catalogFetch("Harbor", "https://harbor.example.com/v2/"),
      ),
    ).rejects.toThrow(/No enabled, connected app catalog/);
  });
});
