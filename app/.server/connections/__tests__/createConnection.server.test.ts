import { beforeEach, describe, expect, test, vi } from "vitest";

import { createConnectionWithCatalogValidation } from "../createConnection.server";
import { Prisma } from "~/.generated/client";
import { prisma } from "~/.server/db/prisma";
import { getBucketCatalog } from "~/.server/providers/bucketCatalog.server";
import { getProviderCatalog } from "~/.server/providers/providerCatalog.server";
import mock from "~/utils/__tests__/__mocks__";

vi.mock("~/.server/db/prisma", () => ({
  prisma: {
    connectionConfig: { create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn() },
  },
}));
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

// OSS build: the bucket-catalog check is skipped (free-text bucket allowed).
vi.mock("~/config", () => ({ cytarioConfig: { providers: { source: "oss" } } }));

const catalog = mock.providerCatalog({
  providerConnections: [mock.providerConnection({ id: "pc-mock" })],
  providerRoles: [
    // Org-wide role (empty allowedScopes) so any scope in the payload passes.
    mock.providerRole({
      providerConnectionId: "pc-mock",
      accessLevel: "read-only",
      allowedScopes: [],
    }),
  ],
});

const payload = {
  name: "DEMO bucket",
  providerConnectionId: "pc-mock",
  bucketName: "demo-bucket",
  prefix: "",
  grants: [{ scope: "org1", accessLevel: "read-only" as const }],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getProviderCatalog).mockResolvedValue(catalog);
});

describe("createConnectionWithCatalogValidation", () => {
  test("creates with organization + createdBy bound by the caller, never applying a bucket policy", async () => {
    const created = mock.connectionConfig({ organization: "org1" });
    vi.mocked(prisma.connectionConfig.create).mockResolvedValue(created as never);

    const result = await createConnectionWithCatalogValidation("org1", "admin-portal", payload, "");

    expect(result).toEqual({ ok: true, created: true, connection: created });
    expect(prisma.connectionConfig.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organization: "org1",
          createdBy: "admin-portal",
          bucketName: "demo-bucket",
          providerConnectionId: "pc-mock",
        }),
      }),
    );
    // The core never applies a bucket policy — application is the caller's
    // concern (form action applies under the user's STS session; the API
    // records externally-managed and skips apply entirely).
    expect(prisma.connectionConfig.update).not.toHaveBeenCalled();
  });

  test("idempotent: a P2002 on the tuple returns the existing connection as created:false", async () => {
    const existing = mock.connectionConfig({ organization: "org1" });
    const violation = new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
      code: "P2002",
      clientVersion: "test",
      meta: { target: ["organization", "providerConnectionId", "bucketName", "prefix"] },
    });
    vi.mocked(prisma.connectionConfig.create).mockRejectedValue(violation);
    vi.mocked(prisma.connectionConfig.findFirst).mockResolvedValue(existing as never);

    const result = await createConnectionWithCatalogValidation("org1", "admin-portal", payload, "");

    expect(result).toEqual({ ok: true, created: false, connection: existing });
  });

  test("a P2002 with no existing tuple row surfaces as a validation error, never a silent update", async () => {
    const violation = new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
      code: "P2002",
      clientVersion: "test",
      meta: { target: ["organization", "providerConnectionId", "bucketName", "prefix"] },
    });
    vi.mocked(prisma.connectionConfig.create).mockRejectedValue(violation);
    vi.mocked(prisma.connectionConfig.findFirst).mockResolvedValue(null as never);

    const result = await createConnectionWithCatalogValidation("org1", "admin-portal", payload, "");

    expect(result.ok).toBe(false);
    expect(prisma.connectionConfig.update).not.toHaveBeenCalled();
  });

  test("schema failures map to error: schema with field errors", async () => {
    const result = await createConnectionWithCatalogValidation(
      "org1",
      "admin-portal",
      { ...payload, name: "x" },
      "",
    );
    expect(result.ok).toBe(false);
    if (!result.ok && result.error === "schema") {
      expect(result.errors.name).toBeDefined();
    } else {
      throw new Error("expected schema error");
    }
    expect(prisma.connectionConfig.create).not.toHaveBeenCalled();
  });

  test("provider catalog unavailability maps to error: catalog with message", async () => {
    vi.mocked(getProviderCatalog).mockRejectedValue(new Error("lookup down"));

    const result = await createConnectionWithCatalogValidation("org1", "admin-portal", payload, "");

    expect(result.ok).toBe(false);
    if (!result.ok && result.error === "catalog") {
      expect(result.message).toBe("lookup down");
    } else {
      throw new Error("expected catalog error");
    }
  });

  test("unknown provider connection maps to error: validation", async () => {
    const result = await createConnectionWithCatalogValidation(
      "org1",
      "admin-portal",
      { ...payload, providerConnectionId: "pc-unknown" },
      "",
    );
    expect(result.ok).toBe(false);
    if (!result.ok && result.error === "validation") {
      expect(result.errors?.providerConnectionId).toContain("Unknown provider connection");
    } else {
      throw new Error("expected validation error");
    }
    expect(prisma.connectionConfig.create).not.toHaveBeenCalled();
  });

  test("OSS build: a bucket outside any bucket catalog is accepted (free-text bucket)", async () => {
    // getBucketCatalog is never consulted in an OSS build; the payload's
    // demo-bucket is not in any catalog yet the create succeeds.
    const created = mock.connectionConfig({ organization: "org1" });
    vi.mocked(prisma.connectionConfig.create).mockResolvedValue(created as never);

    const result = await createConnectionWithCatalogValidation("org1", "admin-portal", payload, "");

    expect(result.ok).toBe(true);
    expect(getBucketCatalog).not.toHaveBeenCalled();
  });
});
