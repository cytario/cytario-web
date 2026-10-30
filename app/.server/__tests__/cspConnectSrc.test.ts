import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { resolveConnectSrcHosts } from "~/.server/cspConnectSrc.server";

vi.mock("~/.server/auth/orgTokenExchange", () => ({
  getOrExchangeOrgAccessToken: vi.fn().mockResolvedValue({
    accessToken: "narrow-access",
    expiresAt: Date.now() + 300_000,
    organization: "org1",
  }),
  getOrExchangeOrgToken: vi.fn().mockResolvedValue({
    accessToken: "narrow-id",
    expiresAt: Date.now() + 300_000,
    organization: "org1",
  }),
}));
const ORG = "vericura";
const TOKEN = "test-access-token";

const {
  getSessionMock,
  getSessionDataMock,
  getProviderCatalogMock,
  getBucketCatalogMock,
  listConnectionsMock,
  resolveMock,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  getSessionDataMock: vi.fn(),
  getProviderCatalogMock: vi.fn(),
  getBucketCatalogMock: vi.fn(),
  listConnectionsMock: vi.fn(),
  resolveMock: vi.fn(),
}));

vi.mock("~/.server/auth/getSession", () => ({
  getSession: getSessionMock,
  getSessionData: getSessionDataMock,
}));

vi.mock("~/.server/providers/providerCatalog.server", () => ({
  getProviderCatalog: getProviderCatalogMock,
  resolveConnectionProviderWithGrants: resolveMock,
}));

vi.mock("~/.server/providers/bucketCatalog.server", () => ({
  getBucketCatalog: getBucketCatalogMock,
}));

vi.mock("~/config", () => ({
  cytarioConfig: { providers: { source: "portal" } },
}));

vi.mock("~/routes/connections/connections.server", () => ({
  listConnections: listConnectionsMock,
}));

const sessionWith = (organization: string | undefined, accessToken: string | null = TOKEN) => ({
  user: organization ? { organization } : {},
  authTokens: accessToken ? { accessToken: accessToken ?? undefined } : undefined,
});

// happy-dom strips `cookie` from Request-construction headers; setting it
// after construction survives.
const requestWithCookie = () => {
  const request = new Request("https://app.cytar.io/objects");
  request.headers.set("cookie", "__session=abc123");
  return request;
};

describe("resolveConnectSrcHosts", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    getSessionMock.mockResolvedValue({});
    listConnectionsMock.mockResolvedValue([]);
    getBucketCatalogMock.mockResolvedValue({ buckets: [] });
    resolveMock.mockImplementation(
      (
        _catalog: unknown,
        connection: { publicEndpoint?: string | null; providerConnectionId: string },
      ) =>
        connection.publicEndpoint
          ? { endpoint: connection.publicEndpoint, region: "eu-central-1" }
          : undefined,
    );
  });

  afterEach(() => {
    warnSpy.mockRestore();
    vi.clearAllMocks();
  });

  test("emits the endpoint origin per self-hosted provider connection", async () => {
    getSessionDataMock.mockResolvedValue(sessionWith(ORG));
    getProviderCatalogMock.mockResolvedValue({
      providerConnections: [
        { id: "rustfs", endpoint: "https://s3.example.com", region: "eu-central-1" },
      ],
    });

    const hosts = await resolveConnectSrcHosts(requestWithCookie());
    expect(hosts).toEqual(["https://s3.example.com"]);
    expect(getProviderCatalogMock).toHaveBeenCalledWith(ORG, "narrow-access");
  });

  test("an AWS provider endpoint yields the regional origin, not the endpoint's own region", async () => {
    getSessionDataMock.mockResolvedValue(sessionWith(ORG));
    getProviderCatalogMock.mockResolvedValue({
      providerConnections: [
        { id: "public", endpoint: "https://s3.us-east-1.amazonaws.com", region: "us-east-1" },
      ],
    });

    const hosts = await resolveConnectSrcHosts(requestWithCookie());
    expect(hosts).toEqual(["https://s3.us-east-1.amazonaws.com"]);
  });

  test("a public connection with a fixed AWS endpoint and a discovered region admits that region's origin", async () => {
    getSessionDataMock.mockResolvedValue(sessionWith(ORG));
    getProviderCatalogMock.mockResolvedValue({
      providerConnections: [
        {
          id: "public",
          endpoint: "https://s3.us-east-1.amazonaws.com",
          region: "us-east-1",
          isPublic: true,
        },
      ],
    });
    getBucketCatalogMock.mockResolvedValue({ buckets: [] });
    listConnectionsMock.mockResolvedValue([
      {
        providerConnectionId: "public",
        bucketName: "sea-ad-spatial-transcriptomics",
        publicEndpoint: null,
        publicRegion: "us-west-2",
        grants: [],
      },
    ]);
    resolveMock.mockImplementation(
      (
        _catalog: unknown,
        connection: { publicEndpoint?: string | null; publicRegion?: string | null },
      ) => ({
        endpoint: connection.publicEndpoint ?? "https://s3.us-east-1.amazonaws.com",
        region: connection.publicRegion ?? "us-east-1",
      }),
    );

    const hosts = await resolveConnectSrcHosts(requestWithCookie());
    expect(hosts).toContain("https://s3.us-west-2.amazonaws.com");
    expect(hosts).toContain("https://s3.us-east-1.amazonaws.com");
  });

  test("emits the regional S3 endpoint origin for a null (AWS) endpoint", async () => {
    getSessionDataMock.mockResolvedValue(sessionWith(ORG));
    getProviderCatalogMock.mockResolvedValue({
      providerConnections: [{ id: "aws", endpoint: null, region: "us-east-1" }],
    });

    expect(await resolveConnectSrcHosts(requestWithCookie())).toEqual([
      "https://s3.us-east-1.amazonaws.com",
    ]);
  });

  test("admits a public connection's per-connection endpoint override", async () => {
    getSessionDataMock.mockResolvedValue(sessionWith(ORG));
    getProviderCatalogMock.mockResolvedValue({
      providerConnections: [
        // The catalog's public provider carries no endpoint (AWS default);
        // the host comes from the connection row's override.
        { id: "public", endpoint: null, region: "eu-central-1", isPublic: true },
      ],
    });
    listConnectionsMock.mockResolvedValue([
      {
        providerConnectionId: "public",
        bucketName: "open-data",
        publicEndpoint: "https://data.open.example.org",
        grants: [],
      },
    ]);

    const hosts = await resolveConnectSrcHosts(requestWithCookie());
    expect(hosts).toContain("https://s3.eu-central-1.amazonaws.com");
    expect(hosts).toContain("https://data.open.example.org");
  });

  test("admits a registered bucket's region when it differs from the provider default", async () => {
    getSessionDataMock.mockResolvedValue(sessionWith(ORG));
    getProviderCatalogMock.mockResolvedValue({
      providerConnections: [{ id: "aws", endpoint: null, region: "us-east-1" }],
    });
    getBucketCatalogMock.mockResolvedValue({
      buckets: [
        {
          providerConnectionId: "aws",
          bucketName: "sea-ad-spatial-transcriptomics",
          region: "us-west-2",
        },
      ],
    });
    listConnectionsMock.mockResolvedValue([]);

    const hosts = await resolveConnectSrcHosts(requestWithCookie());
    expect(hosts).toContain("https://s3.us-west-2.amazonaws.com");
    expect(hosts).toContain("https://s3.us-east-1.amazonaws.com");
  });

  test("passes the bucket catalog to the connection resolver — bucket-row region wins for existing connections", async () => {
    getSessionDataMock.mockResolvedValue(sessionWith(ORG));
    getProviderCatalogMock.mockResolvedValue({
      providerConnections: [{ id: "aws", endpoint: null, region: "us-east-1" }],
    });
    const bucketCatalog = {
      buckets: [{ providerConnectionId: "aws", bucketName: "allencell", region: "us-west-2" }],
    };
    getBucketCatalogMock.mockResolvedValue(bucketCatalog);
    listConnectionsMock.mockResolvedValue([
      {
        providerConnectionId: "aws",
        bucketName: "allencell",
        publicEndpoint: null,
        publicRegion: null,
        grants: [],
      },
    ]);
    resolveMock.mockImplementation(
      (
        _catalog: unknown,
        connection: { publicEndpoint?: string | null; publicRegion?: string | null },
        bucketRows?: { buckets: Array<{ region: string }> },
      ) => {
        const bucketRow = bucketRows?.buckets[0];
        return {
          endpoint: connection.publicEndpoint ?? null,
          region: bucketRow?.region ?? connection.publicRegion ?? "us-east-1",
        };
      },
    );

    const hosts = await resolveConnectSrcHosts(requestWithCookie());
    expect(resolveMock).toHaveBeenCalledWith(expect.anything(), expect.anything(), bucketCatalog);
    expect(hosts).toContain("https://s3.us-west-2.amazonaws.com");
  });

  test("a bucket-catalog lookup failure degrades to the provider-default regions", async () => {
    getSessionDataMock.mockResolvedValue(sessionWith(ORG));
    getProviderCatalogMock.mockResolvedValue({
      providerConnections: [{ id: "aws", endpoint: null, region: "us-east-1" }],
    });
    getBucketCatalogMock.mockRejectedValue(new Error("portal unreachable"));
    listConnectionsMock.mockResolvedValue([]);

    const hosts = await resolveConnectSrcHosts(requestWithCookie());
    expect(hosts).toEqual(["https://s3.us-east-1.amazonaws.com"]);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  test("fails closed when no hosts resolve — never a wildcard", async () => {
    getSessionDataMock.mockResolvedValue(sessionWith(ORG));
    getProviderCatalogMock.mockResolvedValue({ providerConnections: [] });

    expect(await resolveConnectSrcHosts(requestWithCookie())).toEqual([]);
  });

  test("requires an active organization", async () => {
    getSessionDataMock.mockResolvedValue(sessionWith(undefined));

    expect(await resolveConnectSrcHosts(requestWithCookie())).toEqual([]);
    expect(getProviderCatalogMock).not.toHaveBeenCalled();
  });

  test("requires an access token", async () => {
    getSessionDataMock.mockResolvedValue(sessionWith(ORG, null));

    expect(await resolveConnectSrcHosts(requestWithCookie())).toEqual([]);
    expect(getProviderCatalogMock).not.toHaveBeenCalled();
  });

  test("a request without a cookie yields no hosts", async () => {
    const request = new Request("https://app.cytar.io/objects");
    expect(await resolveConnectSrcHosts(request)).toEqual([]);
    expect(getSessionMock).not.toHaveBeenCalled();
  });

  test("a session read failure fails closed with a warn", async () => {
    getSessionDataMock.mockRejectedValue(new Error("redis down"));

    expect(await resolveConnectSrcHosts(requestWithCookie())).toEqual([]);
    expect(warnSpy).toHaveBeenCalled();
  });

  test("a catalog lookup failure fails closed with a warn", async () => {
    getSessionDataMock.mockResolvedValue(sessionWith(ORG));
    getProviderCatalogMock.mockRejectedValue(new Error("portal unreachable"));

    expect(await resolveConnectSrcHosts(requestWithCookie())).toEqual([]);
    expect(warnSpy).toHaveBeenCalled();
  });

  test("drops a non-https endpoint with a warn", async () => {
    getSessionDataMock.mockResolvedValue(sessionWith(ORG));
    getProviderCatalogMock.mockResolvedValue({
      providerConnections: [
        { id: "bad", endpoint: "http://minio.example.com", region: "eu-central-1" },
        { id: "good", endpoint: "https://minio.example.com", region: "eu-central-1" },
      ],
    });

    expect(await resolveConnectSrcHosts(requestWithCookie())).toEqual([
      "https://minio.example.com",
    ]);
    expect(warnSpy).toHaveBeenCalled();
  });

  test("drops an unparseable endpoint with a warn", async () => {
    getSessionDataMock.mockResolvedValue(sessionWith(ORG));
    getProviderCatalogMock.mockResolvedValue({
      providerConnections: [{ id: "bad", endpoint: "not a url", region: "eu-central-1" }],
    });

    expect(await resolveConnectSrcHosts(requestWithCookie())).toEqual([]);
    expect(warnSpy).toHaveBeenCalled();
  });

  test("deduplicates identical origins across provider connections", async () => {
    getSessionDataMock.mockResolvedValue(sessionWith(ORG));
    getProviderCatalogMock.mockResolvedValue({
      providerConnections: [
        { id: "a", endpoint: "https://s3.example.com", region: "eu-central-1" },
        { id: "b", endpoint: "https://s3.example.com", region: "eu-central-1" },
        { id: "c", endpoint: "https://s3.example.com:9000", region: "eu-central-1" },
      ],
    });

    const hosts = await resolveConnectSrcHosts(requestWithCookie());
    expect(hosts).toEqual(["https://s3.example.com", "https://s3.example.com:9000"]);
  });

  test("strips paths from an endpoint carrying one — CSP sources are origins", async () => {
    getSessionDataMock.mockResolvedValue(sessionWith(ORG));
    getProviderCatalogMock.mockResolvedValue({
      providerConnections: [
        { id: "a", endpoint: "https://s3.example.com/buckets", region: "eu-central-1" },
      ],
    });

    expect(await resolveConnectSrcHosts(requestWithCookie())).toEqual(["https://s3.example.com"]);
  });
});
