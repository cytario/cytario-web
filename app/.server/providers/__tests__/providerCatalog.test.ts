import { readFile } from "node:fs/promises";

import {
  clearProviderCatalogCache,
  findProviderConnection,
  findStorageRole,
  getProviderCatalog,
  invalidateProviderCatalogCache,
  resolveConnectionProviderWithGrants,
} from "../providerCatalog.server";
import { cytarioConfig } from "~/config";
import { providerCatalogSchema } from "~/utils/providerCatalog.schema";

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
    expect(catalog.providerConnections).toHaveLength(1);
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
    expect(catalog.providerConnections).toHaveLength(1);
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

describe("catalog payload defaults", () => {
  test("C-378: defaults accessLevel to read-only when the catalog payload omits it", () => {
    expect(PARSED_CATALOG.providerRoles[0].accessLevel).toBe("read-only");
  });
});

describe("catalog lookup helpers", () => {
  test("findProviderConnection locates by id", () => {
    expect(findProviderConnection(PARSED_CATALOG, "pc-1")?.region).toBe("eu-central-1");
    expect(findProviderConnection(PARSED_CATALOG, "nope")).toBeUndefined();
  });
});

describe("findStorageRole", () => {
  test("matches a role by provider connection + access level", () => {
    const role = findStorageRole(PARSED_CATALOG, {
      providerConnectionId: "pc-1",
      accessLevel: "read-only",
    });
    expect(role?.id).toBe("pr-1");
  });

  test("returns undefined when the connection has no role with the level", () => {
    expect(
      findStorageRole(PARSED_CATALOG, { providerConnectionId: "pc-1", accessLevel: "admin" }),
    ).toBeUndefined();
  });

  test("returns undefined when the bucket row id does not match", () => {
    expect(
      findStorageRole(PARSED_CATALOG, {
        providerConnectionId: "pc-1",
        accessLevel: "read-only",
        bucketId: "other-bucket",
      }),
    ).toBeUndefined();
  });
});

describe("resolveConnectionProviderWithGrants", () => {
  const connection = {
    providerConnectionId: "pc-1",
    bucketName: "my-bucket",
    grants: [
      { scope: "lab/team-a", accessLevel: "read-only" },
      { scope: "lab/team-b", accessLevel: "admin" },
    ],
  };

  test("resolves each grant's level to a concrete role ARN and drops level-less grants", () => {
    const resolved = resolveConnectionProviderWithGrants(PARSED_CATALOG, connection);
    expect(resolved).toBeDefined();
    expect(resolved?.region).toBe("eu-central-1");
    expect(resolved?.grants).toEqual([
      {
        scope: "lab/team-a",
        roleArn: "arn:aws:iam::123456789012:role/cytario/provider-roles/reader",
        accessLevel: "read-only",
      },
    ]);
    expect(resolved?.allowsSharing).toBe(false);
  });

  test("drops grants whose level string is not a known access level", () => {
    const resolved = resolveConnectionProviderWithGrants(PARSED_CATALOG, {
      ...connection,
      grants: [{ scope: "lab/team-a", accessLevel: "banana" }],
    });
    expect(resolved?.grants).toHaveLength(0);
  });

  test("returns undefined when the provider connection is absent", () => {
    expect(
      resolveConnectionProviderWithGrants(PARSED_CATALOG, {
        ...connection,
        providerConnectionId: "pc-missing",
      }),
    ).toBeUndefined();
  });

  test("marks allowsSharing when any grant resolves to an admin role", () => {
    const adminCatalog = {
      ...PARSED_CATALOG,
      providerRoles: [
        ...PARSED_CATALOG.providerRoles,
        {
          ...PARSED_CATALOG.providerRoles[0],
          id: "pr-admin",
          accessLevel: "admin" as const,
          roleArn: "arn:aws:iam::123456789012:role/cytario/provider-roles/admin",
        },
      ],
    };
    const resolved = resolveConnectionProviderWithGrants(adminCatalog, {
      ...connection,
      grants: [{ scope: "lab/team-a", accessLevel: "admin" }],
    });
    expect(resolved?.allowsSharing).toBe(true);
  });
});
