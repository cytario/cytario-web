import { readFile } from "node:fs/promises";
import { afterEach, describe, expect, test, vi } from "vitest";

import { CATALOG_BURST_WINDOW_MS } from "../catalogCache.server";
import {
  BUILTIN_PUBLIC_PROVIDER_ID,
  findProviderConnection,
  findStorageRole,
  getProviderCatalog,
  providerCatalogCache,
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
      catalogFailureBackoffMs: 5_000,
      builtinPublicProvider: {
        endpoint: "https://s3.us-east-1.amazonaws.com",
        region: "us-east-1",
      },
    },
  },
}));

const readFileMock = vi.mocked(readFile);
const providers = cytarioConfig.providers as {
  source: "portal" | "oss";
  portalInternalUrl?: string;
  lookupSecret?: string;
  ossConfigPath?: string;
  builtinPublicProvider: { endpoint: string | null; region: string };
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
      providerConnectionId: "pc-1",
      roleArn: "arn:aws:iam::123456789012:role/cytario/provider-roles/reader",
      allowedScopes: ["lab/team-a"],
      accessLevel: "read-only",
      bucketIds: ["bucket-1"],
    },
    {
      providerConnectionId: "pc-missing",
      roleArn: "arn:aws:iam::123456789012:role/cytario/provider-roles/orphan",
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

const BACKOFF_MS = 5_000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.restoreAllMocks();
  readFileMock.mockReset();
  providerCatalogCache.clear();
  providers.source = "oss";
  providers.portalInternalUrl = undefined;
  providers.lookupSecret = undefined;
  providers.ossConfigPath = "/etc/cytario/providers.yaml";
  providers.builtinPublicProvider = {
    endpoint: "https://s3.us-east-1.amazonaws.com",
    region: "us-east-1",
  };
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
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

  test("accepts a rustfs provider connection with an endpoint", () => {
    const good = {
      ...CATALOG,
      providerConnections: [
        {
          ...CATALOG.providerConnections[0],
          providerType: "rustfs",
          endpoint: "https://s3.example.com",
        },
      ],
    };
    expect(() => providerCatalogSchema.parse(good)).not.toThrow();
  });

  test("rejects a rustfs provider connection with a null endpoint (fail closed)", () => {
    // A null endpoint would silently mint against the AWS default.
    const bad = {
      ...CATALOG,
      providerConnections: [
        { ...CATALOG.providerConnections[0], providerType: "rustfs", endpoint: null },
      ],
    };
    expect(() => providerCatalogSchema.parse(bad)).toThrow(/non-null endpoint/);
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

  test("an appCatalogs entry without registryKind/credentials parses to the harbor + credential-less defaults (SRS-CY-39807/39802)", () => {
    const withoutKindOrCredentials = {
      ...CATALOG,
      appCatalogs: [
        {
          id: "ac-1",
          displayName: "Legacy Catalog",
          registryEndpoint: "https://harbor.example.com",
          namespace: "cytario",
          enabled: true,
          status: "connected" as const,
        },
      ],
    };
    const catalog = providerCatalogSchema.parse(withoutKindOrCredentials);
    // registryKind degrades to harbor.
    expect(catalog.appCatalogs[0].registryKind).toBe("harbor");
    // Absent credentials mean credential-less: the host omits the header.
    expect(catalog.appCatalogs[0].accessAccountId).toBeUndefined();
    expect(catalog.appCatalogs[0].accessAccountSecret).toBeUndefined();
  });

  test("a portal payload with JSON null credentials parses to a credential-less catalog", () => {
    // `.optional()` alone rejects null and the whole provider catalog — storage
    // connections included — fails to parse; the nullToUndefined wrapper normalises it.
    const withNullCredentials = {
      ...CATALOG,
      appCatalogs: [
        {
          id: "ac-1",
          displayName: "Public OCI Catalog",
          registryEndpoint: "https://registry.example.com",
          namespace: "cytario",
          registryKind: "oci-catalog",
          accessAccountId: null,
          accessAccountSecret: null,
          enabled: true,
          status: "connected" as const,
          allowedGroups: [],
        },
      ],
    };
    const catalog = providerCatalogSchema.parse(withNullCredentials);
    expect(catalog.appCatalogs).toHaveLength(1);
    // null normalises to undefined, not a parse failure.
    expect(catalog.appCatalogs[0].accessAccountId).toBeUndefined();
    expect(catalog.appCatalogs[0].accessAccountSecret).toBeUndefined();
    expect(catalog.appCatalogs[0].registryKind).toBe("oci-catalog");
  });

  test("a present-but-empty credential is still rejected (min(1) not loosened)", () => {
    const withEmptyCredential = {
      ...CATALOG,
      appCatalogs: [
        {
          ...CATALOG.appCatalogs[0],
          accessAccountId: "robot$harbor",
          accessAccountSecret: "",
        },
      ],
    };
    expect(() => providerCatalogSchema.parse(withEmptyCredential)).toThrow();
  });

  test("parses an oci-catalog kind with credentials present", () => {
    const oci = {
      ...CATALOG,
      appCatalogs: [
        {
          ...CATALOG.appCatalogs[0],
          registryKind: "oci-catalog",
        },
      ],
    };
    const catalog = providerCatalogSchema.parse(oci);
    expect(catalog.appCatalogs[0].registryKind).toBe("oci-catalog");
    expect(catalog.appCatalogs[0].accessAccountSecret).toBe("secret-token");
  });

  test("rejects a registryKind outside the closed value set", () => {
    const bad = {
      ...CATALOG,
      appCatalogs: [{ ...CATALOG.appCatalogs[0], registryKind: "banana" }],
    };
    expect(() => providerCatalogSchema.parse(bad)).toThrow();
  });

  test("parses a registryPullSecrets map on the compute-provider typeSpecific", () => {
    const withMap = {
      ...CATALOG,
      computeProviders: [
        {
          ...CATALOG.computeProviders[0],
          typeSpecific: {
            ...CATALOG.computeProviders[0].typeSpecific,
            registryPullSecrets: {
              "ac-1":
                "arn:aws:secretsmanager:eu-central-1:123456789012:secret:cytario-compute/cp-1/registry-pull/ac-1",
            },
          },
        },
      ],
    };
    const catalog = providerCatalogSchema.parse(withMap);
    expect(catalog.computeProviders[0].typeSpecific.registryPullSecrets).toEqual({
      "ac-1":
        "arn:aws:secretsmanager:eu-central-1:123456789012:secret:cytario-compute/cp-1/registry-pull/ac-1",
    });
  });

  test("a compute-provider payload without registryPullSecrets still parses (scalar-only legacy shape)", () => {
    const catalog = providerCatalogSchema.parse(CATALOG);
    expect(catalog.computeProviders[0].typeSpecific.registryPullSecrets).toBeUndefined();
    expect(catalog.computeProviders[0].typeSpecific.imagePullSecretRef).toBe(
      "arn:aws:secretsmanager:eu-central-1:123456789012:secret:registry-pull-abc",
    );
  });

  test("a JSON null registryPullSecrets normalises to an absent map, not a parse failure", () => {
    const withNull = {
      ...CATALOG,
      computeProviders: [
        {
          ...CATALOG.computeProviders[0],
          typeSpecific: {
            ...CATALOG.computeProviders[0].typeSpecific,
            registryPullSecrets: null,
          },
        },
      ],
    };
    const catalog = providerCatalogSchema.parse(withNull);
    expect(catalog.computeProviders[0].typeSpecific.registryPullSecrets).toBeUndefined();
  });

  test("rejects an empty pull-secret ARN inside the map (min(1) not loosened)", () => {
    const withEmptyArn = {
      ...CATALOG,
      computeProviders: [
        {
          ...CATALOG.computeProviders[0],
          typeSpecific: {
            ...CATALOG.computeProviders[0].typeSpecific,
            registryPullSecrets: { "ac-1": "" },
          },
        },
      ],
    };
    expect(() => providerCatalogSchema.parse(withEmptyArn)).toThrow();
  });

  test("preserves the max-resources blob's declared fields", () => {
    const withMax = {
      ...CATALOG,
      computeProviders: [
        {
          ...CATALOG.computeProviders[0],
          typeSpecific: {
            ...CATALOG.computeProviders[0].typeSpecific,
            maxResources: { vcpu: 48, memory: 196608, gpuCount: 4 },
          },
        },
      ],
    };
    const catalog = providerCatalogSchema.parse(withMax);
    expect(catalog.computeProviders[0].typeSpecific.maxResources).toMatchObject({
      vcpu: 48,
      memory: 196608,
      gpuCount: 4,
    });
  });

  test("strips unknown sibling keys from typeSpecific", () => {
    const withSibling = {
      ...CATALOG,
      computeProviders: [
        {
          ...CATALOG.computeProviders[0],
          typeSpecific: {
            ...CATALOG.computeProviders[0].typeSpecific,
            unexpectedSiblingKey: ["x"],
          },
        },
      ],
    };
    const catalog = providerCatalogSchema.parse(withSibling);
    // Unknown keys are stripped, so the schema describes exactly the fields
    // the mapper reads.
    const typeSpecific = catalog.computeProviders[0].typeSpecific as Record<string, unknown>;
    expect(typeSpecific.unexpectedSiblingKey).toBeUndefined();
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
        "  - providerConnectionId: pc-1",
        "    roleArn: arn:aws:iam::123456789012:role/cytario/provider-roles/reader",
        "    allowedScopes:",
        "      - lab/team-a",
        "    accessLevel: read-only",
      ].join("\n"),
    );

    const catalog = await getProviderCatalog("acme");

    expect(readFileMock).toHaveBeenCalledWith("/etc/cytario/providers.yaml", "utf8");
    expect(catalog.providerConnections).toHaveLength(2);
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

describe("getProviderCatalog — built-in public provider", () => {
  const ossYaml = [
    "providerConnections:",
    "  - id: pc-1",
    "    name: Prod",
    "    providerType: aws",
    "    endpoint: null",
    "    region: eu-central-1",
    "    status: connected",
    "providerRoles:",
    "  - providerConnectionId: pc-1",
    "    roleArn: arn:aws:iam::123456789012:role/cytario/provider-roles/reader",
    "    allowedScopes:",
    "      - lab/team-a",
    "    accessLevel: read-only",
  ].join("\n");

  test("appends the built-in public provider to the OSS catalog", async () => {
    readFileMock.mockResolvedValue(ossYaml);

    const catalog = await getProviderCatalog("acme");

    const builtin = catalog.providerConnections.find((c) => c.id === BUILTIN_PUBLIC_PROVIDER_ID);
    expect(builtin).toEqual({
      id: BUILTIN_PUBLIC_PROVIDER_ID,
      name: "Public",
      providerType: "aws",
      endpoint: "https://s3.us-east-1.amazonaws.com",
      region: "us-east-1",
      status: "connected",
      isPublic: true,
    });
  });

  test("appends the built-in public provider to the portal catalog", async () => {
    providers.source = "portal";
    providers.portalInternalUrl = "http://portal.internal:4000";
    providers.lookupSecret = "s3cr3t";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(CATALOG),
    });
    vi.stubGlobal("fetch", fetchMock);

    const catalog = await getProviderCatalog("acme");

    expect(catalog.providerConnections).toHaveLength(2);
    expect(catalog.providerConnections.at(-1)?.id).toBe(BUILTIN_PUBLIC_PROVIDER_ID);
    expect(catalog.providerConnections.at(-1)?.isPublic).toBe(true);
  });

  test("the org's own provider wins: the built-in is not appended when the id collides", async () => {
    providers.source = "portal";
    providers.portalInternalUrl = "http://portal.internal:4000";
    providers.lookupSecret = "s3cr3t";
    const colliding = {
      ...CATALOG,
      providerConnections: [
        {
          ...CATALOG.providerConnections[0],
          id: BUILTIN_PUBLIC_PROVIDER_ID,
          name: "Org-curated public data",
          isPublic: true,
        },
      ],
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(colliding),
    });
    vi.stubGlobal("fetch", fetchMock);

    const catalog = await getProviderCatalog("acme");

    expect(catalog.providerConnections).toHaveLength(1);
    expect(catalog.providerConnections[0].name).toBe("Org-curated public data");
  });

  test("the built-in is absent when the deployment opts out (empty endpoint)", async () => {
    providers.builtinPublicProvider = { endpoint: null, region: "us-east-1" };
    readFileMock.mockResolvedValue(ossYaml);

    const catalog = await getProviderCatalog("acme");

    expect(catalog.providerConnections).toHaveLength(1);
    expect(catalog.providerConnections.some((c) => c.id === BUILTIN_PUBLIC_PROVIDER_ID)).toBe(
      false,
    );
  });

  test("the built-in carries the env-overridden endpoint and region", async () => {
    providers.builtinPublicProvider = { endpoint: "http://localhost:9000", region: "us-east-2" };
    readFileMock.mockResolvedValue(ossYaml);

    const catalog = await getProviderCatalog("acme");

    const builtin = catalog.providerConnections.find((c) => c.id === BUILTIN_PUBLIC_PROVIDER_ID);
    expect(builtin?.endpoint).toBe("http://localhost:9000");
    expect(builtin?.region).toBe("us-east-2");
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

  test("serves a catalog change on the very next request after the burst window", async () => {
    const narrowed = {
      ...CATALOG,
      appCatalogs: [{ ...CATALOG.appCatalogs[0], allowedGroups: ["lab/team-a", "lab/team-b"] }],
    };
    const widened = {
      ...CATALOG,
      appCatalogs: [{ ...CATALOG.appCatalogs[0], allowedGroups: [] }],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(narrowed) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(widened) });
    vi.stubGlobal("fetch", fetchMock);

    const first = await getProviderCatalog("acme");
    expect(first.appCatalogs[0].allowedGroups).toEqual(["lab/team-a", "lab/team-b"]);

    await vi.advanceTimersByTimeAsync(CATALOG_BURST_WINDOW_MS);

    const second = await getProviderCatalog("acme");
    expect(second.appCatalogs[0].allowedGroups).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("coalesces concurrent callers for the same org onto one portal round-trip", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(CATALOG),
    });
    vi.stubGlobal("fetch", fetchMock);

    const [a, b, c] = await Promise.all([
      getProviderCatalog("acme"),
      getProviderCatalog("acme"),
      getProviderCatalog("acme"),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  test("per-org cache separation", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(CATALOG),
    });
    vi.stubGlobal("fetch", fetchMock);

    await getProviderCatalog("acme");
    await getProviderCatalog("globex");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("serves a success from the burst cache within the window without refetching", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(CATALOG),
    });
    vi.stubGlobal("fetch", fetchMock);

    await getProviderCatalog("acme");
    await vi.advanceTimersByTimeAsync(CATALOG_BURST_WINDOW_MS - 1);
    await getProviderCatalog("acme");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("fast-fails within the backoff window without another round-trip", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getProviderCatalog("acme")).rejects.toThrow(/unavailable/i);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await expect(getProviderCatalog("acme")).rejects.toThrow(/unavailable/i);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("retries the portal after the backoff window expires", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("ECONNREFUSED"))
      .mockResolvedValue({ ok: true, json: () => Promise.resolve(CATALOG) });
    vi.stubGlobal("fetch", fetchMock);

    await expect(getProviderCatalog("acme")).rejects.toThrow(/unavailable/i);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(BACKOFF_MS);

    const catalog = await getProviderCatalog("acme");
    expect(catalog.providerConnections).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("never serves a stale success during an outage that starts after it", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(CATALOG) })
      .mockRejectedValue(new Error("ECONNREFUSED"));
    vi.stubGlobal("fetch", fetchMock);

    await getProviderCatalog("acme");
    await vi.advanceTimersByTimeAsync(CATALOG_BURST_WINDOW_MS);

    await expect(getProviderCatalog("acme")).rejects.toThrow(/unavailable/i);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("an in-flight failure still fast-fails callers that arrive while it resolves", async () => {
    let rejectFetch: (error: unknown) => void = () => {};
    const fetchMock = vi.fn().mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectFetch = reject;
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const first = getProviderCatalog("acme");
    const second = getProviderCatalog("acme");
    rejectFetch(new Error("ECONNREFUSED"));
    await expect(first).rejects.toThrow(/unavailable/i);
    await expect(second).rejects.toThrow(/unavailable/i);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await expect(getProviderCatalog("acme")).rejects.toThrow(/unavailable/i);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("a failure for one org does not back off another org", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("ECONNREFUSED"))
      .mockResolvedValue({ ok: true, json: () => Promise.resolve(CATALOG) });
    vi.stubGlobal("fetch", fetchMock);

    await expect(getProviderCatalog("acme")).rejects.toThrow(/unavailable/i);

    const catalog = await getProviderCatalog("globex");
    expect(catalog.providerConnections).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

const PARSED_CATALOG = providerCatalogSchema.parse(CATALOG);

describe("catalog payload defaults", () => {
  test("C-378: defaults accessLevel to read-only when the catalog payload omits it", () => {
    expect(PARSED_CATALOG.providerRoles[0].accessLevel).toBe("read-only");
  });

  test("defaults isPublic to false when the catalog payload omits it", () => {
    expect(PARSED_CATALOG.providerConnections[0].isPublic).toBe(false);
  });

  test("parses an explicitly public provider connection", () => {
    const catalog = providerCatalogSchema.parse({
      ...CATALOG,
      providerConnections: [{ ...CATALOG.providerConnections[0], isPublic: true }],
    });
    expect(catalog.providerConnections[0].isPublic).toBe(true);
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
    expect(role?.roleArn).toBe("arn:aws:iam::123456789012:role/cytario/provider-roles/reader");
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
    expect(resolved?.isPublic).toBe(false);
  });

  test("a public provider synthesizes read-only ARN-less grants regardless of the stored level", () => {
    const publicCatalog = providerCatalogSchema.parse({
      ...CATALOG,
      providerConnections: [{ ...CATALOG.providerConnections[0], isPublic: true }],
      providerRoles: [],
    });
    const resolved = resolveConnectionProviderWithGrants(publicCatalog, {
      providerConnectionId: "pc-1",
      bucketName: "my-bucket",
      grants: [
        { scope: "lab/team-a", accessLevel: "admin" },
        { scope: "lab/team-b", accessLevel: "read-write" },
      ],
    });
    expect(resolved).toBeDefined();
    expect(resolved?.isPublic).toBe(true);
    expect(resolved?.allowsSharing).toBe(false);
    expect(resolved?.grants).toEqual([
      { scope: "lab/team-a", roleArn: null, accessLevel: "read-only" },
      { scope: "lab/team-b", roleArn: null, accessLevel: "read-only" },
    ]);
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

  test("a public connection resolves the per-connection endpoint override, null falls back to the provider", () => {
    const publicCatalog = providerCatalogSchema.parse({
      ...CATALOG,
      providerConnections: [{ ...CATALOG.providerConnections[0], isPublic: true }],
      providerRoles: [],
    });
    expect(
      resolveConnectionProviderWithGrants(publicCatalog, {
        ...connection,
        publicEndpoint: "http://localhost:9000",
      })?.endpoint,
    ).toBe("http://localhost:9000");
    expect(
      resolveConnectionProviderWithGrants(publicCatalog, {
        ...connection,
        publicEndpoint: null,
      })?.endpoint,
    ).toBeNull();
  });

  test("a non-public connection ignores the per-connection endpoint override", () => {
    const catalogWithEndpoint = providerCatalogSchema.parse({
      ...CATALOG,
      providerConnections: [
        { ...CATALOG.providerConnections[0], endpoint: "https://minio.example.com" },
      ],
    });
    expect(
      resolveConnectionProviderWithGrants(catalogWithEndpoint, {
        ...connection,
        publicEndpoint: "http://localhost:9000",
      })?.endpoint,
    ).toBe("https://minio.example.com");
  });

  test("marks allowsSharing when any grant resolves to an admin role", () => {
    const adminCatalog = {
      ...PARSED_CATALOG,
      providerRoles: [
        ...PARSED_CATALOG.providerRoles,
        {
          ...PARSED_CATALOG.providerRoles[0],
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
