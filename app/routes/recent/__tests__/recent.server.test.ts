import { beforeEach, describe, expect, test, vi } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  recentlyViewed: {
    upsert: vi.fn(),
    findMany: vi.fn(),
    deleteMany: vi.fn(),
  },
}));

vi.mock("~/.server/db/prisma", () => ({
  prisma: mockPrisma,
}));

import {
  clearAllRecentlyViewed,
  getRecentlyViewed,
  removeRecentlyViewed,
  upsertRecentlyViewed,
} from "../recent.server";

describe("recent.server", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("upsertRecentlyViewed", () => {
    test("upserts a recently viewed item with correct where/update/create", async () => {
      mockPrisma.recentlyViewed.upsert.mockResolvedValue({});

      await upsertRecentlyViewed("user-1", {
        connectionId: 1,
        connectionName: "my-bucket",
        pathName: "data/image.ome.tiff",
        name: "image.ome.tiff",
        type: "file",
      });

      expect(mockPrisma.recentlyViewed.upsert).toHaveBeenCalledOnce();
      const call = mockPrisma.recentlyViewed.upsert.mock.calls[0][0];
      expect(call.where.userId_connectionId_pathName).toEqual({
        userId: "user-1",
        connectionId: 1,
        pathName: "data/image.ome.tiff",
      });
      expect(call.update.name).toBe("image.ome.tiff");
      expect(call.update.type).toBe("file");
      expect(call.update.viewedAt).toBeInstanceOf(Date);
      expect(call.create.userId).toBe("user-1");
      expect(call.create.connectionName).toBe("my-bucket");
      expect(call.create.pathName).toBe("data/image.ome.tiff");
    });
  });

  describe("getRecentlyViewed", () => {
    test("fetches recently viewed items ordered by viewedAt desc", async () => {
      const mockItems = [
        {
          id: 2,
          userId: "user-1",
          connectionName: "bucket-a",
          pathName: "b.tiff",
          name: "b.tiff",
          type: "file",
          viewedAt: new Date(),
        },
      ];
      mockPrisma.recentlyViewed.findMany.mockResolvedValue(mockItems);

      const result = await getRecentlyViewed("user-1", 10);

      expect(result).toEqual(mockItems);
      expect(mockPrisma.recentlyViewed.findMany).toHaveBeenCalledWith({
        where: { userId: "user-1" },
        orderBy: { viewedAt: "desc" },
        take: 10,
      });
    });

    test("uses default limit of 20", async () => {
      mockPrisma.recentlyViewed.findMany.mockResolvedValue([]);

      await getRecentlyViewed("user-1");

      expect(mockPrisma.recentlyViewed.findMany).toHaveBeenCalledWith({
        where: { userId: "user-1" },
        orderBy: { viewedAt: "desc" },
        take: 20,
      });
    });
  });

  describe("clearAllRecentlyViewed", () => {
    test("deletes all items for the given user", async () => {
      mockPrisma.recentlyViewed.deleteMany.mockResolvedValue({ count: 5 });

      await clearAllRecentlyViewed("user-1");

      expect(mockPrisma.recentlyViewed.deleteMany).toHaveBeenCalledWith({
        where: { userId: "user-1" },
      });
    });
  });

  describe("removeRecentlyViewed", () => {
    test("deletes a specific item by userId, connectionId, and pathName", async () => {
      mockPrisma.recentlyViewed.deleteMany.mockResolvedValue({ count: 1 });

      await removeRecentlyViewed("user-1", 1, "data/file.csv");

      expect(mockPrisma.recentlyViewed.deleteMany).toHaveBeenCalledWith({
        where: { userId: "user-1", connectionId: 1, pathName: "data/file.csv" },
      });
    });
  });
});
