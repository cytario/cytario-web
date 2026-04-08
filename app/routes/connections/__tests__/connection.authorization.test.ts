import { prisma } from "~/.server/db/prisma";
import { deleteConnection } from "~/routes/connections/deleteConnection.action";
import { updateConnection } from "~/routes/connections/updateConnection.action";
import mock from "~/utils/__tests__/__mocks__";

vi.mock("~/.server/db/prisma", () => ({
  prisma: {
    connectionConfig: {
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

// Authorization is NOT mocked — real canSee/canModify/canCreate logic runs

const cytarioConfig = mock.connectionConfig({
  ownerScope: "cytario",
  name: "test-connection",
});

const personalConfig = mock.connectionConfig({
  ownerScope: "mock-user-id",
  name: "personal-connection",
});

const adminUser = mock.user({
  sub: "admin-user-id",
  groups: ["cytario"],
  adminScopes: ["cytario"],
  isRealmAdmin: false,
});

const regularUser = mock.user({
  sub: "regular-user-id",
  groups: ["cytario"],
  adminScopes: [],
  isRealmAdmin: false,
});

const personalUser = mock.user({
  sub: "mock-user-id",
  groups: ["cytario"],
  adminScopes: [],
  isRealmAdmin: false,
});

const realmAdmin = mock.user({
  sub: "realm-admin-id",
  groups: ["cytario/admins"],
  adminScopes: ["cytario"],
  isRealmAdmin: true,
});

const outsideUser = mock.user({
  sub: "outside-user-id",
  groups: ["other-org"],
  adminScopes: ["other-org"],
  isRealmAdmin: false,
});

const validUpdates = {
  name: "updated-connection",
  ownerScope: "cytario",
  provider: "aws",
  bucketName: "updated-bucket",
  prefix: "",
  endpoint: "https://s3.eu-central-1.amazonaws.com",
  roleArn: "arn:aws:iam::123:role/test",
  region: "eu-central-1",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SRS-CY-44104: deleteConnection authorization", () => {
  test("admin of scope can delete", async () => {
    vi.mocked(prisma.connectionConfig.findUnique).mockResolvedValue(
      cytarioConfig,
    );

    await deleteConnection(adminUser, "test-connection");

    expect(prisma.connectionConfig.delete).toHaveBeenCalledWith({
      where: { id: cytarioConfig.id },
    });
  });

  test("owner (personal scope) can delete", async () => {
    vi.mocked(prisma.connectionConfig.findUnique).mockResolvedValue(
      personalConfig,
    );

    await deleteConnection(personalUser, "personal-connection");

    expect(prisma.connectionConfig.delete).toHaveBeenCalled();
  });

  test("realm admin can delete any connection", async () => {
    vi.mocked(prisma.connectionConfig.findUnique).mockResolvedValue(
      cytarioConfig,
    );

    await deleteConnection(realmAdmin, "test-connection");

    expect(prisma.connectionConfig.delete).toHaveBeenCalled();
  });

  test("group member without admin cannot delete", async () => {
    vi.mocked(prisma.connectionConfig.findUnique).mockResolvedValue(
      cytarioConfig,
    );

    await expect(
      deleteConnection(regularUser, "test-connection"),
    ).rejects.toThrow("Not authorized to delete this connection config");
  });

  test("user from different scope cannot see or delete", async () => {
    vi.mocked(prisma.connectionConfig.findUnique).mockResolvedValue(
      cytarioConfig,
    );

    await expect(
      deleteConnection(outsideUser, "test-connection"),
    ).rejects.toThrow("Connection config not found");
  });

  test("throws 'not found' when connection doesn't exist", async () => {
    vi.mocked(prisma.connectionConfig.findUnique).mockResolvedValue(null);

    await expect(
      deleteConnection(adminUser, "nonexistent"),
    ).rejects.toThrow("Connection config not found");
  });
});

describe("SRS-CY-44107: updateConnection authorization", () => {
  test("admin of scope can update", async () => {
    vi.mocked(prisma.connectionConfig.findUnique).mockResolvedValue(
      cytarioConfig,
    );
    vi.mocked(prisma.connectionConfig.update).mockResolvedValue({
      ...cytarioConfig,
      ...validUpdates,
    });

    const result = await updateConnection(
      adminUser,
      "test-connection",
      validUpdates,
    );

    expect(prisma.connectionConfig.update).toHaveBeenCalled();
    expect(result.name).toBe("updated-connection");
  });

  test("owner (personal scope) can update own connection", async () => {
    vi.mocked(prisma.connectionConfig.findUnique).mockResolvedValue(
      personalConfig,
    );
    vi.mocked(prisma.connectionConfig.update).mockResolvedValue({
      ...personalConfig,
      ...validUpdates,
      ownerScope: "mock-user-id",
    });

    await updateConnection(personalUser, "personal-connection", {
      ...validUpdates,
      ownerScope: "mock-user-id",
    });

    expect(prisma.connectionConfig.update).toHaveBeenCalled();
  });

  test("realm admin can update any connection", async () => {
    vi.mocked(prisma.connectionConfig.findUnique).mockResolvedValue(
      cytarioConfig,
    );
    vi.mocked(prisma.connectionConfig.update).mockResolvedValue({
      ...cytarioConfig,
      ...validUpdates,
    });

    await updateConnection(realmAdmin, "test-connection", validUpdates);

    expect(prisma.connectionConfig.update).toHaveBeenCalled();
  });

  test("group member without admin cannot update", async () => {
    vi.mocked(prisma.connectionConfig.findUnique).mockResolvedValue(
      cytarioConfig,
    );

    await expect(
      updateConnection(regularUser, "test-connection", validUpdates),
    ).rejects.toThrow("Not authorized to modify this connection");
  });

  test("user from different scope cannot see or update", async () => {
    vi.mocked(prisma.connectionConfig.findUnique).mockResolvedValue(
      cytarioConfig,
    );

    await expect(
      updateConnection(outsideUser, "test-connection", validUpdates),
    ).rejects.toThrow("Connection not found");
  });

  test("scope change requires canCreate on new scope", async () => {
    vi.mocked(prisma.connectionConfig.findUnique).mockResolvedValue(
      personalConfig,
    );
    vi.mocked(prisma.connectionConfig.update).mockResolvedValue({
      ...personalConfig,
      ...validUpdates,
      ownerScope: "cytario",
    });

    // personalUser owns the connection (personal scope) and is in cytario group
    // but is NOT admin of cytario — cannot move to cytario scope
    await expect(
      updateConnection(personalUser, "personal-connection", {
        ...validUpdates,
        ownerScope: "cytario",
      }),
    ).rejects.toThrow("Not authorized to assign to this scope");
  });

  test("admin can change scope to their admin scope", async () => {
    // Admin owns a personal connection and moves it to cytario scope
    const adminPersonalConfig = mock.connectionConfig({
      ownerScope: "admin-user-id",
      name: "admin-personal",
    });

    vi.mocked(prisma.connectionConfig.findUnique).mockResolvedValue(
      adminPersonalConfig,
    );
    vi.mocked(prisma.connectionConfig.update).mockResolvedValue({
      ...adminPersonalConfig,
      ...validUpdates,
      ownerScope: "cytario",
    });

    await updateConnection(adminUser, "admin-personal", {
      ...validUpdates,
      ownerScope: "cytario",
    });

    expect(prisma.connectionConfig.update).toHaveBeenCalled();
  });

  test("same-scope update does not check canCreate", async () => {
    // regularUser can see cytario-scoped but cannot modify
    // This test verifies canModify is checked, not canCreate
    vi.mocked(prisma.connectionConfig.findUnique).mockResolvedValue(
      cytarioConfig,
    );

    await expect(
      updateConnection(regularUser, "test-connection", validUpdates),
    ).rejects.toThrow("Not authorized to modify this connection");
  });

  test("throws 'not found' when connection doesn't exist", async () => {
    vi.mocked(prisma.connectionConfig.findUnique).mockResolvedValue(null);

    await expect(
      updateConnection(adminUser, "nonexistent", validUpdates),
    ).rejects.toThrow("Connection not found");
  });
});
