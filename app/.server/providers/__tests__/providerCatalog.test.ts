import { readFile } from "node:fs/promises";

import {
  clearProviderCatalogCache,
  findProviderConnection,
  findProviderRole,
  getProviderCatalog,
  invalidateProviderCatalogCache,
  resolveConnectionProvider,
  resolveConnectionProviderWithGrants,
} from "../providerCatalog.server";
import { cytarioConfig } from "~/config";
import { clientProviderRoleSchema, providerCatalogSchema } from "~/utils/providerCatalog.schema";

vi.mock("node:fs/promises", () => {
  const readFile = vi.fn();
  return { readFile, default: { readFile } };
});

vi.mock("~/config", () => ({
  cytarioConfig: {
    providers: {
      source: "oss",
      portalInternalUrl: undefined,
      lookupSecret: undefined,
      ossConfigPath: undefined,
    },
  },
}));

const readFileMock = vi.mocked(readFile);
const providers = cytarioConfig.providers as {
  source: "portal" | "oss";
  portalInternalUrl?: string;
  lookupSecret?: string;
  ossConfigPath?: string;
};

const CATALOG = {
  providerConnections: [
    {
      id: "pc-1",
      name: "Prod",
      providerType: "aws" as const,
      endpoint: null,
      region: "eu-central-1",
      status: "connected" as const,
    },
    {
      id: "pc-presigned",
      name: "S3 Compatible (presigned)",
      providerType: "presigned" as const,
      endpoint: "https://minio.example.com",
      region: "us-east-1",
      status: "connected" as const,
    },
  ],
  providerRoles: [
    {
      id: "pr-1",
      providerConnectionId: "pc-1",
      roleArn: "arn:aws:iam::123456789012:role/cytario/provider-roles/reader",
      name: "Reader",
      allowedScopes: ["lab/team-a"],
      accessLevel: "read-only",
      bucketIds: ["bucket-1"],
    },
    {
      id: "pr-presigned-rw",
      providerConnectionId: "pc-presigned",
      roleArn: null,
      name: "Read-Write (presigned)",
      allowedScopes: ["lab/team-a"],
      accessLevel: "read-write",
      bucketIds: [],
      staticCredentials: {
        accessKeyId: "AKIA-test",
        secretAccessKey: "secret-test",
      },
    },
    {
      id: "pr-orphan",
      providerConnectionId: "pc-missing",
      roleArn: "arn:aws:iam::123456789012:role/cytario/provider-roles/orphan",
      name: "Orphan",
      allowedScopes: [],
      accessLevel: "admin",
      bucketIds: [],
    },
  ],
  computeProviders: [
    {
      id: "cp-1",
      providerConnectionId: "pc-1",
      displayName: "GPU Cluster",
      region: "eu-central-1",
      type: "AWS_BATCH" as const,
      typeSpecific: {
        jobQueueArn: "arn:aws:batch:eu-central-1:123456789012:job-queue/gpu-queue",
        jobRoleArn: "arn:aws:iam::123456789012:role/cytario/compute/job-role",
        executionRoleArn: "arn:aws:iam::123456789012:role/cytario/compute/exec-role",
        imagePullSecretRef:
          "arn:aws:secretsmanager:eu-central-1:123456789012:secret:registry-pull-abc",
        logGroupName: "/aws/batch/cytario-compute/cp-1",
        defaultResources: { vcpus: 4, memory: 16384 },
      },
      status: "connected" as const,
    },
  ],
  computeRoles: [
    {
      id: "cr-1",
      computeProviderId: "cp-1",
      roleArn: "arn:aws:iam::123456789012:role/cytario/compute/submit-role",
      name: "Submitter",
      description: "Batch submit role",
      allowedScopes: ["lab/team-a"],
    },
  ],
  appCatalogs: [
    {
      id: "ac-1",
      displayName: "Harbor Catalog",
      registryEndpoint: "https://harbor.example.com",
      namespace: "cytario",
      accessAccountId: "robot$harbor+cytario",
      accessAccountSecret: "secret-token",
      enabled: true,
      status: "connected" as const,
      allowedGroups: ["lab/team-a", "lab/team-b"],
    },
  ],
};

beforeEach(() => {
  vi.restoreAllMocks();
  readFileMock.mockReset();
  clearProviderCatalogCache();
  providers.source = "oss";
  providers.portalInternalUrl = undefined;
  providers.lookupSecret = undefined;
  providers.ossConfigPath = "/etc/cytario/providers.yaml";
});

describe("providerCatalogSchema", () => {
  test("accepts the pinned lookup JSON shape", () => {
    expect(() => providerCatalogSchema.parse(CATALOG)).not.toThrow();
  });

  test("rejects an unknown provider type", () => {
    const bad = {
      ...CATALOG,
      providerConnections: [{ ...CATALOG.providerConnections[0], providerType: "gcp" }],
    };
    expect(() => providerCatalogSchema.parse(bad)).toThrow();
  });

  test("rejects an unknown connection status", () => {
    const bad = {
      ...CATALOG,
      providerConnections: [{ ...CATALOG.providerConnections[0], status: "banana" }],
    };
    expect(() => providerCatalogSchema.parse(bad)).toThrow();
  });

  test("parses allowedGroups on an app catalog (SRS-CY-45107/39806)", () => {
    const catalog = providerCatalogSchema.parse(CATALOG);
    expect(catalog.appCatalogs[0].allowedGroups).toEqual(["lab/team-a", "lab/team-b"]);
  });

  test("a missing allowedGroups field degrades to org-wide (empty set), never deny-all", () => {
    const withoutAllowedGroups = {
      ...CATALOG,
      appCatalogs: [
        {
          id: "ac-1",
          displayName: "Harbor Catalog",
          registryEndpoint: "https://harbor.example.com",
          namespace: "cytario",
          accessAccountId: "robot$harbor+cytario",
          accessAccountSecret: "secret-token",
          enabled: true,
          status: "connected" as const,
        },
      ],
    };
    const catalog = providerCatalogSchema.parse(withoutAllowedGroups);
    expect(catalog.appCatalogs[0].allowedGroups).toEqual([]);
  });

  test("accepts a presigned provider connection with staticCredentials on its role", () => {
    const catalog = providerCatalogSchema.parse(CATALOG);
    const presignedConn = catalog.providerConnections.find(
      (c) => c.id === "pc-presigned",
    );
    expect(presignedConn?.providerType).toBe("presigned");
    expect(presignedConn?.endpoint).toBe("https://minio.example.com");

    const presignedRole = catalog.providerRoles.find(
      (r) => r.id === "pr-presigned-rw",
    );
    expect(presignedRole?.roleArn).toBeNull();
    expect(presignedRole?.staticCredentials).toEqual({
      accessKeyId: "AKIA-test",
      secretAccessKey: "secret-test",
    });
  });

  test("clientProviderRoleSchema omits staticCredentials", () => {
    const role = clientProviderRoleSchema.parse({
      id: "pr-1",
      providerConnectionId: "pc-1",
      roleArn: "arn:aws:iam::1:role/r",
      name: "Reader",
      allowedScopes: [],
      accessLevel: "read-only",
      bucketIds: [],
      staticCredentials: { accessKeyId: "LEAK", secretAccessKey: "LEAK" },
    });
    expect(role).not.toHaveProperty("staticCredentials");
  });
});

describe("resolveConnectionProviderWithGrants (C-377)", () => {
  test("resolves a presigned provider with credentialMode='presigned' and staticCredentials", () => {
    const catalog = providerCatalogSchema.parse(CATALOG);
    const resolved = resolveConnectionProviderWithGrants(catalog, {
      providerConnectionId: "pc-presigned",
      grants: [{ scope: "lab/team-a", providerRoleId: "pr-presigned-rw" }],
    });
    expect(resolved).toBeDefined();
    expect(resolved?.providerType).toBe("presigned");
    expect(resolved?.credentialMode).toBe("presigned");
    expect(resolved?.staticCredentials).toEqual({
      accessKeyId: "AKIA-test",
      secretAccessKey: "secret-test",
    });
    expect(resolved?.endpoint).toBe("https://minio.example.com");
    expect(resolved?.region).toBe("us-east-1");
    expect(resolved?.grants).toEqual([
      { scope: "lab/team-a", roleArn: null, accessLevel: "read-write" },
    ]);
  });

  test("resolves an AWS provider with credentialMode='sts' and null staticCredentials", () => {
    const catalog = providerCatalogSchema.parse(CATALOG);
    const resolved = resolveConnectionProviderWithGrants(catalog, {
      providerConnectionId: "pc-1",
      grants: [{ scope: "lab/team-a", providerRoleId: "pr-1" }],
    });
    expect(resolved).toBeDefined();
    expect(resolved?.providerType).toBe("aws");
    expect(resolved?.credentialMode).toBe("sts");
    expect(resolved?.staticCredentials).toBeNull();
  });

  test("returns undefined for a missing provider connection", () => {
    const catalog = providerCatalogSchema.parse(CATALOG);
    const resolved = resolveConnectionProviderWithGrants(catalog, {
      providerConnectionId: "pc-missing",
      grants: [{ scope: "lab/team-a", providerRoleId: "pr-1" }],
    });
    expect(resolved).toBeUndefined();
  });

  test("skips grants whose providerRole belongs to a different connection", () => {
    const catalog = providerCatalogSchema.parse(CATALOG);
    const resolved = resolveConnectionProviderWithGrants(catalog, {
      providerConnectionId: "pc-presigned",
      grants: [{ scope: "lab/team-a", providerRoleId: "pr-1" }],
    });
    expect(resolved).toBeDefined();
    expect(resolved?.grants).toEqual([]);
  });
});

describe("getProviderCatalog (OSS build)", () => {
  test("reads and validates the YAML file", async () => {
    readFileMock.mockResolvedValue(
      [
        "providerConnections:",
        "  - id: pc-1",
        "    name: Prod",
        "    providerType: aws",
        "    endpoint: null",
        "    region: eu-central-1",
        "    status: connected",
        "providerRoles:",
        "  - id: pr-1",
        "    providerConnectionId: pc-1",
        "    roleArn: arn:aws:iam::123456789012:role/cytario/provider-roles/reader",
        "    name: Reader",
        "    allowedScopes:",
        "      - lab/team-a",
        "    accessLevel: read-only",
      ].join("\n"),
    );

    const catalog = await getProviderCatalog("acme");

    expect(readFileMock).toHaveBeenCalledWith("/etc/cytario/providers.yaml", "utf8");
    expect(catalog.providerConnections).toHaveLength(1);
    expect(catalog.providerRoles[0].roleArn).toContain("cytario/provider-roles/reader");
  });

  test("throws a clear error when the OSS path is unset", async () => {
    providers.ossConfigPath = undefined;
    await expect(getProviderCatalog("acme")).rejects.toThrow(/PROVIDERS_OSS_CONFIG_PATH/);
  });

  test("throws when the YAML fails schema validation", async () => {
    readFileMock.mockResolvedValue("providerConnections: not-an-array\nproviderRoles: []");
    await expect(getProviderCatalog("acme")).rejects.toThrow();
  });
});

describe("getProviderCatalog (portal build)", () => {
  beforeEach(() => {
    providers.source = "portal";
    providers.portalInternalUrl = "http://portal.internal:4000";
    providers.lookupSecret = "s3cr3t";
  });

  test("fetches from the lookup endpoint with the shared-secret header", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(CATALOG),
    });
    vi.stubGlobal("fetch", fetchMock);

    const catalog = await getProviderCatalog("acme");

    const [calledUrl, init] = fetchMock.mock.calls[0];
    expect(String(calledUrl)).toContain("http://portal.internal:4000/org/providers");
    expect(init.headers["X-Providers-Lookup-Secret"]).toBe("s3cr3t");
    expect(catalog.providerConnections).toHaveLength(2);
  });

  test("degrades to a clear error on non-OK response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: () => Promise.resolve("unavailable"),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(getProviderCatalog("acme")).rejects.toThrow(/unavailable/i);
  });

  test("degrades to a clear error when the fetch throws", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getProviderCatalog("acme")).rejects.toThrow(/unavailable/i);
  });

  test("throws when portal config is incomplete", async () => {
    providers.lookupSecret = undefined;
    await expect(getProviderCatalog("acme")).rejects.toThrow(/PROVIDERS_LOOKUP_SECRET/);
  });

  test("serves repeat lookups for the same org from the cache", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(CATALOG),
    });
    vi.stubGlobal("fetch", fetchMock);

    await getProviderCatalog("acme");
    await getProviderCatalog("acme");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("caches per organization, not globally", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(CATALOG),
    });
    vi.stubGlobal("fetch", fetchMock);

    await getProviderCatalog("acme");
    await getProviderCatalog("globex");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("never caches a failed lookup", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("ECONNREFUSED"))
      .mockResolvedValue({ ok: true, json: () => Promise.resolve(CATALOG) });
    vi.stubGlobal("fetch", fetchMock);

    await expect(getProviderCatalog("acme")).rejects.toThrow(/unavailable/i);
    const catalog = await getProviderCatalog("acme");
    expect(catalog.providerConnections).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("serves a fresh allowedGroups set after cache invalidation on access-scope change", async () => {
    const scopeRestricted = {
      ...CATALOG,
      appCatalogs: [
        {
          ...CATALOG.appCatalogs[0],
          allowedGroups: ["lab/team-a", "lab/team-b"],
        },
      ],
    };
    const scopeWidened = {
      ...CATALOG,
      appCatalogs: [
        {
          ...CATALOG.appCatalogs[0],
          allowedGroups: [],
        },
      ],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(scopeRestricted) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(scopeWidened) });
    vi.stubGlobal("fetch", fetchMock);

    const first = await getProviderCatalog("acme");
    expect(first.appCatalogs[0].allowedGroups).toEqual(["lab/team-a", "lab/team-b"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    invalidateProviderCatalogCache("acme", "ac-1");

    const second = await getProviderCatalog("acme");
    expect(second.appCatalogs[0].allowedGroups).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("invalidateProviderCatalogCache is a no-op when the cache is already empty", () => {
    expect(() => invalidateProviderCatalogCache("acme", "ac-1")).not.toThrow();
  });

  test("invalidateProviderCatalogCache does not evict another organization's cache", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(CATALOG),
    });
    vi.stubGlobal("fetch", fetchMock);

    await getProviderCatalog("acme");
    await getProviderCatalog("globex");
    expect(fetchMock).toHaveBeenCalledTimes(2);

    invalidateProviderCatalogCache("acme", "ac-1");

    await getProviderCatalog("globex");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

const PARSED_CATALOG = providerCatalogSchema.parse(CATALOG);

describe("resolveConnectionProvider", () => {
  test("resolves references to concrete AWS attributes", () => {
    const connectionProvider = resolveConnectionProvider(PARSED_CATALOG, {
      providerConnectionId: "pc-1",
      providerRoleId: "pr-1",
    });
    expect(connectionProvider).toEqual({
      providerType: "aws",
      endpoint: null,
      region: "eu-central-1",
      roleArn: "arn:aws:iam::123456789012:role/cytario/provider-roles/reader",
      allowedScopes: ["lab/team-a"],
      accessLevel: "read-only",
      credentialMode: "sts",
      staticCredentials: null,
    });
  });

  test("C-378: defaults accessLevel to read-only when the catalog payload omits it", () => {
    expect(PARSED_CATALOG.providerRoles[0].accessLevel).toBe("read-only");
  });

  test("returns undefined when the provider connection is missing", () => {
    const connectionProvider = resolveConnectionProvider(PARSED_CATALOG, {
      providerConnectionId: "pc-missing",
      providerRoleId: "pr-1",
    });
    expect(connectionProvider).toBeUndefined();
  });

  test("returns undefined when the provider role is missing", () => {
    const connectionProvider = resolveConnectionProvider(PARSED_CATALOG, {
      providerConnectionId: "pc-1",
      providerRoleId: "pr-missing",
    });
    expect(connectionProvider).toBeUndefined();
  });

  test("rejects a role whose providerConnectionId does not match the connection", () => {
    const connectionProvider = resolveConnectionProvider(PARSED_CATALOG, {
      providerConnectionId: "pc-1",
      providerRoleId: "pr-orphan",
    });
    expect(connectionProvider).toBeUndefined();
  });
});

describe("catalog lookup helpers", () => {
  test("findProviderConnection / findProviderRole locate by id", () => {
    expect(findProviderConnection(PARSED_CATALOG, "pc-1")?.region).toBe("eu-central-1");
    expect(findProviderConnection(PARSED_CATALOG, "nope")).toBeUndefined();
    expect(findProviderRole(PARSED_CATALOG, "pr-1")?.name).toBe("Reader");
    expect(findProviderRole(PARSED_CATALOG, "nope")).toBeUndefined();
  });
});
