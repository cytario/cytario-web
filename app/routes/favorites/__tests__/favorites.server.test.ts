import { beforeEach, describe, expect, test, vi } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  pinnedPath: {
    upsert: vi.fn(),
    deleteMany: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
  },
}));

vi.mock("~/.server/db/prisma", () => ({
  prisma: mockPrisma,
}));

import { addFavorite, getFavorites, removeFavorite } from "../favorites.server";

describe("favorites.server", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("addFavorite", () => {
    test("upserts a favorite with BigInt totalSize", async () => {
      mockPrisma.pinnedPath.upsert.mockResolvedValue({});

      await addFavorite("user-1", {
        connectionId: "conn-uuid-1",
        connectionName: "bucket-a",
        pathName: "data/images/",
        displayName: "images",
        totalSize: 1024000,
        lastModified: 1700000000000,
      });

      expect(mockPrisma.pinnedPath.upsert).toHaveBeenCalledOnce();
      const call = mockPrisma.pinnedPath.upsert.mock.calls[0][0];
      expect(call.where.userId_connectionId_pathName).toEqual({
        userId: "user-1",
        connectionId: "conn-uuid-1",
        pathName: "data/images/",
      });
      expect(call.create.connectionName).toBe("bucket-a");
      expect(call.create.totalSize).toBe(BigInt(1024000));
      expect(call.create.lastModified).toBeInstanceOf(Date);
      expect(call.update.displayName).toBe("images");
    });

    test("handles null totalSize and lastModified", async () => {
      mockPrisma.pinnedPath.upsert.mockResolvedValue({});

      await addFavorite("user-1", {
        connectionId: "conn-uuid-1",
        connectionName: "bucket-a",
        pathName: "data/",
        displayName: "data",
      });

      const call = mockPrisma.pinnedPath.upsert.mock.calls[0][0];
      expect(call.create.totalSize).toBeNull();
      expect(call.create.lastModified).toBeNull();
      expect(call.update.totalSize).toBeNull();
      expect(call.update.lastModified).toBeNull();
    });
  });

  describe("removeFavorite", () => {
    test("deletes a favorite by userId, connectionId, and pathName", async () => {
      mockPrisma.pinnedPath.deleteMany.mockResolvedValue({ count: 1 });

      await removeFavorite("user-1", "conn-uuid-1", "data/images/");

      expect(mockPrisma.pinnedPath.deleteMany).toHaveBeenCalledWith({
        where: { userId: "user-1", connectionId: "conn-uuid-1", pathName: "data/images/" },
      });
    });
  });

  describe("getFavorites", () => {
    test("fetches all favorites ordered by id desc", async () => {
      const mockFavorites = [
        {
          id: 3,
          userId: "user-1",
          connectionName: "bucket-a",
          pathName: "data/",
          displayName: "data",
          totalSize: BigInt(5000),
          lastModified: new Date(),
        },
      ];
      mockPrisma.pinnedPath.findMany.mockResolvedValue(mockFavorites);

      const result = await getFavorites("user-1");

      expect(result).toEqual(mockFavorites);
      expect(mockPrisma.pinnedPath.findMany).toHaveBeenCalledWith({
        where: { userId: "user-1" },
        orderBy: { id: "desc" },
      });
    });
  });
});
