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

import {
  addPinnedPath,
  checkIsPinnedPath,
  getPinnedPaths,
  removePinnedPath,
} from "../pinnedPaths.server";

describe("pinnedPaths.server", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("addPinnedPath", () => {
    test("upserts a pinned path with BigInt totalSize", async () => {
      mockPrisma.pinnedPath.upsert.mockResolvedValue({});

      await addPinnedPath("user-1", {
        alias: "bucket-a",
        pathName: "data/images/",
        displayName: "images",
        totalSize: 1024000,
        lastModified: 1700000000000,
      });

      expect(mockPrisma.pinnedPath.upsert).toHaveBeenCalledOnce();
      const call = mockPrisma.pinnedPath.upsert.mock.calls[0][0];
      expect(call.where.userId_connectionName_pathName).toEqual({
        userId: "user-1",
        connectionName: "bucket-a",
        pathName: "data/images/",
      });
      expect(call.create.connectionName).toBe("bucket-a");
      expect(call.create.totalSize).toBe(BigInt(1024000));
      expect(call.create.lastModified).toBeInstanceOf(Date);
      expect(call.update.displayName).toBe("images");
    });

    test("handles null totalSize and lastModified", async () => {
      mockPrisma.pinnedPath.upsert.mockResolvedValue({});

      await addPinnedPath("user-1", {
        alias: "bucket-a",
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

  describe("removePinnedPath", () => {
    test("deletes a pinned path by userId, alias, and pathName", async () => {
      mockPrisma.pinnedPath.deleteMany.mockResolvedValue({ count: 1 });

      await removePinnedPath("user-1", "bucket-a", "data/images/");

      expect(mockPrisma.pinnedPath.deleteMany).toHaveBeenCalledWith({
        where: { userId: "user-1", connectionName: "bucket-a", pathName: "data/images/" },
      });
    });
  });

  describe("getPinnedPaths", () => {
    test("fetches all pinned paths ordered by id desc", async () => {
      const mockPins = [
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
      mockPrisma.pinnedPath.findMany.mockResolvedValue(mockPins);

      const result = await getPinnedPaths("user-1");

      expect(result).toEqual(mockPins);
      expect(mockPrisma.pinnedPath.findMany).toHaveBeenCalledWith({
        where: { userId: "user-1" },
        orderBy: { id: "desc" },
      });
    });
  });

  describe("checkIsPinnedPath", () => {
    test("returns true when path is pinned", async () => {
      mockPrisma.pinnedPath.count.mockResolvedValue(1);

      const result = await checkIsPinnedPath("user-1", "bucket-a", "data/");

      expect(result).toBe(true);
      expect(mockPrisma.pinnedPath.count).toHaveBeenCalledWith({
        where: { userId: "user-1", connectionName: "bucket-a", pathName: "data/" },
      });
    });

    test("returns false when path is not pinned", async () => {
      mockPrisma.pinnedPath.count.mockResolvedValue(0);

      const result = await checkIsPinnedPath("user-1", "bucket-a", "other/");

      expect(result).toBe(false);
    });
  });
});
