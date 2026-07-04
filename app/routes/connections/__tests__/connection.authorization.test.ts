import { Prisma } from "~/.generated/client";
import { prisma } from "~/.server/db/prisma";
import {
  createConnection,
  uniqueViolationErrors,
} from "~/routes/connections/createConnection.action";
import { deleteConnection } from "~/routes/connections/deleteConnection.action";
import { updateConnection } from "~/routes/connections/updateConnection.action";
import mock from "~/utils/__tests__/__mocks__";

vi.mock("~/.server/db/prisma", () => ({
  prisma: {
    connectionConfig: {
      findFirst: vi.fn(),
      findMany: vi.fn(async () => []),
      update: vi.fn(),
      delete: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock("~/.server/db/redis", () => ({ redis: {} }));

// Authorization is NOT mocked — real canSee/canModify/canCreate logic runs.

const cytarioConfig = mock.connectionConfig({ scope: "cytario", name: "test-connection" });
const personalConfig = mock.connectionConfig({
  scope: "mock-user-id",
  name: "personal-connection",
});

const adminUser = mock.user({
  sub: "admin-user-id",
  groups: ["cytario"],
  adminScopes: ["cytario"],
});
const regularUser = mock.user({ sub: "regular-user-id", groups: ["cytario"], adminScopes: [] });
const personalUser = mock.user({ sub: "mock-user-id", groups: ["cytario"], adminScopes: [] });
const orgRootAdmin = mock.user({ sub: "org-root-admin-id", groups: [], adminScopes: ["*"] });
const outsideUser = mock.user({
  sub: "outside-user-id",
  groups: ["other-org"],
  adminScopes: ["other-org"],
});

const validUpdates = {
  name: "updated-connection",
  scope: "cytario",
  bucketName: "updated-bucket",
  prefix: "",
  providerConnectionId: "pc-1",
  providerRoleId: "pr-1",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("deleteConnection authorization", () => {
  test("admin of scope can delete", async () => {
    vi.mocked(prisma.connectionConfig.findFirst).mockResolvedValue(cytarioConfig);
    await deleteConnection(adminUser, "test-connection");
    expect(prisma.connectionConfig.delete).toHaveBeenCalledWith({
      where: { id: cytarioConfig.id },
    });
  });

  test("owner (personal scope) can delete", async () => {
    vi.mocked(prisma.connectionConfig.findFirst).mockResolvedValue(personalConfig);
    await deleteConnection(personalUser, "personal-connection");
    expect(prisma.connectionConfig.delete).toHaveBeenCalled();
  });

  test("org-root admin can delete any connection within the org", async () => {
    vi.mocked(prisma.connectionConfig.findFirst).mockResolvedValue(cytarioConfig);
    await deleteConnection(orgRootAdmin, "test-connection");
    expect(prisma.connectionConfig.delete).toHaveBeenCalled();
  });

  test("group member without admin cannot delete", async () => {
    vi.mocked(prisma.connectionConfig.findFirst).mockResolvedValue(cytarioConfig);
    await expect(deleteConnection(regularUser, "test-connection")).rejects.toThrow(
      "Not authorized to delete this connection config",
    );
  });

  test("user from a different org cannot see or delete", async () => {
    vi.mocked(prisma.connectionConfig.findFirst).mockResolvedValue(cytarioConfig);
    await expect(deleteConnection(outsideUser, "test-connection")).rejects.toThrow(
      "Connection config not found",
    );
  });

  test("throws 'not found' when connection doesn't exist", async () => {
    vi.mocked(prisma.connectionConfig.findFirst).mockResolvedValue(null);
    await expect(deleteConnection(adminUser, "nonexistent")).rejects.toThrow(
      "Connection config not found",
    );
  });
});

describe("createConnection strictness", () => {
  // A pre-existing (org, providerConnectionId, bucketName, prefix) row must
  // surface as a unique-violation conflict — never be silently repointed to
  // the submitted scope without a canModify check on the existing row.
  test("strictly creates — an existing tuple raises P2002 instead of updating", async () => {
    const violation = new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
      code: "P2002",
      clientVersion: "test",
      meta: { target: ["organization", "providerConnectionId", "bucketName", "prefix"] },
    });
    vi.mocked(prisma.connectionConfig.create).mockRejectedValue(violation);

    await expect(
      createConnection("org1", "attacker-personal-scope", "attacker-sub", {
        name: "hijack",
        bucketName: "victim-bucket",
        providerConnectionId: "pc-1",
        providerRoleId: "pr-1",
        prefix: "victim-prefix",
      }),
    ).rejects.toBe(violation);
    expect(prisma.connectionConfig.update).not.toHaveBeenCalled();
  });

  test("maps a name violation to a name field error", () => {
    const violation = new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
      code: "P2002",
      clientVersion: "test",
      meta: { target: ["name"] },
    });
    expect(uniqueViolationErrors(violation)).toEqual({
      name: ["This name is already taken. Please choose another."],
    });
  });

  test("maps a tuple violation to a conflict error", () => {
    const violation = new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
      code: "P2002",
      clientVersion: "test",
      meta: { target: ["organization", "providerConnectionId", "bucketName", "prefix"] },
    });
    expect(uniqueViolationErrors(violation)).toEqual({
      prefix: ["A connection for this bucket and prefix already exists. Edit it instead."],
    });
  });
});

describe("updateConnection authorization", () => {
  test("admin of scope can update", async () => {
    vi.mocked(prisma.connectionConfig.findFirst).mockResolvedValue(cytarioConfig);
    vi.mocked(prisma.connectionConfig.update).mockResolvedValue({
      ...cytarioConfig,
      ...validUpdates,
    });
    const result = await updateConnection(adminUser, "test-connection", validUpdates);
    expect(prisma.connectionConfig.update).toHaveBeenCalled();
    expect(result.name).toBe("updated-connection");
  });

  test("owner (personal scope) can update own connection", async () => {
    vi.mocked(prisma.connectionConfig.findFirst).mockResolvedValue(personalConfig);
    vi.mocked(prisma.connectionConfig.update).mockResolvedValue({
      ...personalConfig,
      ...validUpdates,
      scope: "mock-user-id",
    });
    await updateConnection(personalUser, "personal-connection", {
      ...validUpdates,
      scope: "mock-user-id",
    });
    expect(prisma.connectionConfig.update).toHaveBeenCalled();
  });

  test("group member without admin cannot update", async () => {
    vi.mocked(prisma.connectionConfig.findFirst).mockResolvedValue(cytarioConfig);
    await expect(updateConnection(regularUser, "test-connection", validUpdates)).rejects.toThrow(
      "Not authorized to modify this connection",
    );
  });

  test("user from a different org cannot see or update", async () => {
    vi.mocked(prisma.connectionConfig.findFirst).mockResolvedValue(cytarioConfig);
    await expect(updateConnection(outsideUser, "test-connection", validUpdates)).rejects.toThrow(
      "Connection not found",
    );
  });

  test("scope change requires canCreate on the new scope", async () => {
    vi.mocked(prisma.connectionConfig.findFirst).mockResolvedValue(personalConfig);
    await expect(
      updateConnection(personalUser, "personal-connection", { ...validUpdates, scope: "cytario" }),
    ).rejects.toThrow("Not authorized to assign to this scope");
  });

  test("admin can change scope to their admin scope", async () => {
    const adminPersonalConfig = mock.connectionConfig({
      scope: "admin-user-id",
      name: "admin-personal",
    });
    vi.mocked(prisma.connectionConfig.findFirst).mockResolvedValue(adminPersonalConfig);
    vi.mocked(prisma.connectionConfig.update).mockResolvedValue({
      ...adminPersonalConfig,
      ...validUpdates,
      scope: "cytario",
    });
    await updateConnection(adminUser, "admin-personal", { ...validUpdates, scope: "cytario" });
    expect(prisma.connectionConfig.update).toHaveBeenCalled();
  });

  test("throws 'not found' when connection doesn't exist", async () => {
    vi.mocked(prisma.connectionConfig.findFirst).mockResolvedValue(null);
    await expect(updateConnection(adminUser, "nonexistent", validUpdates)).rejects.toThrow(
      "Connection not found",
    );
  });
});
