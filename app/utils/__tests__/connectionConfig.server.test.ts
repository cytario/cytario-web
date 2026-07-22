import { prisma } from "~/.server/db/prisma";
import { getConnection, listConnections } from "~/routes/connections/connections.server";
import { createConnection } from "~/routes/connections/createConnection.action";
import { deleteConnection } from "~/routes/connections/deleteConnection.action";
import mock from "~/utils/__tests__/__mocks__";
import { canModify, canSee, filterVisible } from "~/utils/authorization";

vi.mock("~/.server/db/prisma", () => ({
  prisma: {
    connectionConfig: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

vi.mock("~/utils/authorization", () => ({
  canSee: vi.fn(),
  canModify: vi.fn(),
  filterVisible: vi.fn(),
}));

describe("connectionConfig.server", () => {
  const user = mock.user();
  const config = mock.connectionConfig();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("listConnections", () => {
    test("returns only visible configs", async () => {
      const configs = [config, mock.connectionConfig({ name: "other" })];
      vi.mocked(prisma.connectionConfig.findMany).mockResolvedValue(configs);
      vi.mocked(filterVisible).mockReturnValue([config]);

      const result = await listConnections(user);

      expect(prisma.connectionConfig.findMany).toHaveBeenCalledWith({
        where: { organization: "org1" },
        include: { grants: true },
      });
      expect(filterVisible).toHaveBeenCalledWith(user, configs);
      expect(result).toEqual([config]);
    });

    test("throws when the session has no active organization", async () => {
      const zeroOrgUser = mock.user({ organization: undefined });

      await expect(listConnections(zeroOrgUser)).rejects.toThrow(
        "Active organization missing from session",
      );
      expect(prisma.connectionConfig.findMany).not.toHaveBeenCalled();
    });
  });

  describe("getConnection", () => {
    test("returns config when user canSee", async () => {
      vi.mocked(prisma.connectionConfig.findFirst).mockResolvedValue(config);
      vi.mocked(canSee).mockReturnValue(true);

      const result = await getConnection(user, "aws-mock-bucket");

      expect(prisma.connectionConfig.findFirst).toHaveBeenCalledWith({
        where: { name: "aws-mock-bucket", organization: "org1" },
        include: { grants: true },
      });
      expect(canSee).toHaveBeenCalledWith(user, config);
      expect(result).toEqual(config);
    });

    test("returns null when config does not exist", async () => {
      vi.mocked(prisma.connectionConfig.findFirst).mockResolvedValue(null);

      const result = await getConnection(user, "nonexistent");

      expect(result).toBeNull();
    });

    test("returns null when user cannot see config (canSee enforces tenant boundary)", async () => {
      vi.mocked(prisma.connectionConfig.findFirst).mockResolvedValue(config);
      vi.mocked(canSee).mockReturnValue(false);

      const result = await getConnection(user, "aws-mock-bucket");

      expect(result).toBeNull();
    });
  });

  describe("createConnection", () => {
    test("strictly creates — never an upsert that could repoint an existing row", async () => {
      const newConfig = {
        name: "new-conn",
        bucketName: "my-bucket",
        providerConnectionId: "pc-1",
        prefix: "data/",
      };
      const grants = [{ scope: "lab", providerRoleId: "pr-1" }];

      vi.mocked(prisma.connectionConfig.create).mockResolvedValue(
        mock.connectionConfig({ ...newConfig }),
      );

      await createConnection("org1", "user-123", newConfig, grants);

      expect(prisma.connectionConfig.create).toHaveBeenCalledWith({
        data: {
          organization: "org1",
          createdBy: "user-123",
          ...newConfig,
          grants: {
            createMany: {
              data: [{ scope: "lab", providerRoleId: "pr-1" }],
            },
          },
        },
        include: { grants: true },
      });
    });
  });

  describe("deleteConnection", () => {
    test("deletes config when user canSee and canModify", async () => {
      vi.mocked(prisma.connectionConfig.findFirst).mockResolvedValue(config);
      vi.mocked(canSee).mockReturnValue(true);
      vi.mocked(canModify).mockReturnValue(true);

      await deleteConnection(user, 0);

      expect(prisma.connectionConfig.delete).toHaveBeenCalledWith({
        where: { id: config.id },
      });
    });

    test("throws when config not found", async () => {
      vi.mocked(prisma.connectionConfig.findFirst).mockResolvedValue(null);

      await expect(deleteConnection(user, 999)).rejects.toThrow("Connection config not found");
    });

    test("throws when user cannot see config", async () => {
      vi.mocked(prisma.connectionConfig.findFirst).mockResolvedValue(config);
      vi.mocked(canSee).mockReturnValue(false);

      await expect(deleteConnection(user, 0)).rejects.toThrow("Connection config not found");
    });

    test("throws when user cannot modify config", async () => {
      vi.mocked(prisma.connectionConfig.findFirst).mockResolvedValue(config);
      vi.mocked(canSee).mockReturnValue(true);
      vi.mocked(canModify).mockReturnValue(false);

      await expect(deleteConnection(user, 0)).rejects.toThrow(
        "Not authorized to delete this connection config",
      );
    });
  });
});
