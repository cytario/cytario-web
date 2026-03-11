import { canModify, canSee, filterVisible } from "~/.server/auth/authorization";
import { prisma } from "~/.server/db/prisma";
import mock from "~/utils/__tests__/__mocks__";
import {
  deleteConnectionConfig,
  getConnectionByAlias,
  getConnectionConfigs,
  upsertConnectionConfig,
} from "~/utils/connectionConfig.server";

vi.mock("~/.server/db/prisma", () => ({
  prisma: {
    connectionConfig: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

vi.mock("~/.server/auth/authorization", () => ({
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

  describe("getConnectionConfigs", () => {
    test("returns only visible configs", async () => {
      const configs = [config, mock.connectionConfig({ name: "other" })];
      vi.mocked(prisma.connectionConfig.findMany).mockResolvedValue(configs);
      vi.mocked(filterVisible).mockReturnValue([config]);

      const result = await getConnectionConfigs(user);

      expect(prisma.connectionConfig.findMany).toHaveBeenCalled();
      expect(filterVisible).toHaveBeenCalledWith(user, configs);
      expect(result).toEqual([config]);
    });
  });

  describe("getConnectionByAlias", () => {
    test("returns config when user canSee", async () => {
      vi.mocked(prisma.connectionConfig.findUnique).mockResolvedValue(config);
      vi.mocked(canSee).mockReturnValue(true);

      const result = await getConnectionByAlias(user, "aws-mock-bucket");

      expect(prisma.connectionConfig.findUnique).toHaveBeenCalledWith({
        where: { name: "aws-mock-bucket" },
      });
      expect(canSee).toHaveBeenCalledWith(user, config.ownerScope);
      expect(result).toEqual(config);
    });

    test("returns null when config does not exist", async () => {
      vi.mocked(prisma.connectionConfig.findUnique).mockResolvedValue(null);

      const result = await getConnectionByAlias(user, "nonexistent");

      expect(result).toBeNull();
    });

    test("returns null when user cannot see config", async () => {
      vi.mocked(prisma.connectionConfig.findUnique).mockResolvedValue(config);
      vi.mocked(canSee).mockReturnValue(false);

      const result = await getConnectionByAlias(user, "aws-mock-bucket");

      expect(result).toBeNull();
    });
  });

  describe("upsertConnectionConfig", () => {
    test("calls prisma.upsert with correct parameters", async () => {
      const newConfig = {
        name: "new-conn",
        bucketName: "my-bucket",
        provider: "aws",
        roleArn: "arn:aws:iam::123:role/test",
        region: "us-east-1",
        endpoint: "https://s3.amazonaws.com",
        prefix: "data/",
      };

      vi.mocked(prisma.connectionConfig.upsert).mockResolvedValue(
        mock.connectionConfig({ ...newConfig }),
      );

      await upsertConnectionConfig("org1/lab", "user-123", newConfig);

      expect(prisma.connectionConfig.upsert).toHaveBeenCalledWith({
        where: {
          ownerScope_provider_bucketName_prefix: {
            ownerScope: "org1/lab",
            provider: "aws",
            bucketName: "my-bucket",
            prefix: "data/",
          },
        },
        update: { ...newConfig, prefix: "data/" },
        create: {
          ownerScope: "org1/lab",
          createdBy: "user-123",
          ...newConfig,
          prefix: "data/",
        },
      });
    });

    test("defaults prefix to empty string when not provided", async () => {
      const newConfig = {
        name: "new-conn",
        bucketName: "my-bucket",
        provider: "aws",
        roleArn: null,
        region: null,
        endpoint: "https://s3.amazonaws.com",
      };

      vi.mocked(prisma.connectionConfig.upsert).mockResolvedValue(
        mock.connectionConfig(),
      );

      await upsertConnectionConfig("org1/lab", "user-123", newConfig);

      expect(prisma.connectionConfig.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            ownerScope_provider_bucketName_prefix: expect.objectContaining({
              prefix: "",
            }),
          }),
        }),
      );
    });
  });

  describe("deleteConnectionConfig", () => {
    test("deletes config when user canSee and canModify", async () => {
      vi.mocked(prisma.connectionConfig.findUnique).mockResolvedValue(config);
      vi.mocked(canSee).mockReturnValue(true);
      vi.mocked(canModify).mockReturnValue(true);

      await deleteConnectionConfig(user, "aws-mock-bucket");

      expect(prisma.connectionConfig.delete).toHaveBeenCalledWith({
        where: { id: config.id },
      });
    });

    test("throws when config not found", async () => {
      vi.mocked(prisma.connectionConfig.findUnique).mockResolvedValue(null);

      await expect(
        deleteConnectionConfig(user, "nonexistent"),
      ).rejects.toThrow("Connection config not found");
    });

    test("throws when user cannot see config", async () => {
      vi.mocked(prisma.connectionConfig.findUnique).mockResolvedValue(config);
      vi.mocked(canSee).mockReturnValue(false);

      await expect(
        deleteConnectionConfig(user, "aws-mock-bucket"),
      ).rejects.toThrow("Connection config not found");
    });

    test("throws when user cannot modify config", async () => {
      vi.mocked(prisma.connectionConfig.findUnique).mockResolvedValue(config);
      vi.mocked(canSee).mockReturnValue(true);
      vi.mocked(canModify).mockReturnValue(false);

      await expect(
        deleteConnectionConfig(user, "aws-mock-bucket"),
      ).rejects.toThrow("Not authorized to delete this connection config");
    });
  });
});
