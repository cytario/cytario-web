import { readFile } from "node:fs/promises";

import {
  clearProviderCatalogCache,
  findProviderConnection,
  findProviderRole,
  getProviderCatalog,
  resolveConnectionProvider,
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
      allowsSharing: false,
    },
    {
      id: "pr-orphan",
      providerConnectionId: "pc-missing",
      roleArn: "arn:aws:iam::123456789012:role/cytario/provider-roles/orphan",
      name: "Orphan",
      allowedScopes: [],
      allowsSharing: true,
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
});

describe("getProviderCatalog (OSS build)", () => {
  test("reads and validates the YAML file", async () => {
    readFileMock.mockResolvedValue(
      [
        "providerConnections:",
        "  - id: pc-1",
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
        "    allowsSharing: false",
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
});

describe("resolveConnectionProvider", () => {
  test("resolves references to concrete AWS attributes", () => {
    const resolved = resolveConnectionProvider(CATALOG, {
      providerConnectionId: "pc-1",
      providerRoleId: "pr-1",
    });
    expect(resolved).toEqual({
      providerType: "aws",
      endpoint: null,
      region: "eu-central-1",
      roleArn: "arn:aws:iam::123456789012:role/cytario/provider-roles/reader",
      allowedScopes: ["lab/team-a"],
      allowsSharing: false,
    });
  });

  test("returns undefined when the provider connection is missing", () => {
    const resolved = resolveConnectionProvider(CATALOG, {
      providerConnectionId: "pc-missing",
      providerRoleId: "pr-1",
    });
    expect(resolved).toBeUndefined();
  });

  test("returns undefined when the provider role is missing", () => {
    const resolved = resolveConnectionProvider(CATALOG, {
      providerConnectionId: "pc-1",
      providerRoleId: "pr-missing",
    });
    expect(resolved).toBeUndefined();
  });

  test("rejects a role whose providerConnectionId does not match the connection", () => {
    const resolved = resolveConnectionProvider(CATALOG, {
      providerConnectionId: "pc-1",
      providerRoleId: "pr-orphan",
    });
    expect(resolved).toBeUndefined();
  });
});

describe("catalog lookup helpers", () => {
  test("findProviderConnection / findProviderRole locate by id", () => {
    expect(findProviderConnection(CATALOG, "pc-1")?.region).toBe("eu-central-1");
    expect(findProviderConnection(CATALOG, "nope")).toBeUndefined();
    expect(findProviderRole(CATALOG, "pr-1")?.name).toBe("Reader");
    expect(findProviderRole(CATALOG, "nope")).toBeUndefined();
  });
});
