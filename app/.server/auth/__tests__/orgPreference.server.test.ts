import { getPreferredOrg, setPreferredOrg } from "../orgPreference.server";
import { prisma } from "~/.server/db/prisma";

describe("orgPreference", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getPreferredOrg", () => {
    test("returns the stored alias", async () => {
      vi.spyOn(prisma.userOrgPreference, "findUnique").mockResolvedValue({
        userId: "user-1",
        lastOrgAlias: "vericura",
        updatedAt: new Date(),
      } as never);

      await expect(getPreferredOrg("user-1")).resolves.toBe("vericura");
      expect(prisma.userOrgPreference.findUnique).toHaveBeenCalledWith({
        where: { userId: "user-1" },
      });
    });

    test("returns null when the user has no history", async () => {
      vi.spyOn(prisma.userOrgPreference, "findUnique").mockResolvedValue(null);

      await expect(getPreferredOrg("user-2")).resolves.toBeNull();
    });
  });

  describe("setPreferredOrg", () => {
    test("upserts a single row per user", async () => {
      vi.spyOn(prisma.userOrgPreference, "upsert").mockResolvedValue({
        userId: "user-1",
        lastOrgAlias: "cytar",
        updatedAt: new Date(),
      } as never);

      await setPreferredOrg("user-1", "cytar");

      expect(prisma.userOrgPreference.upsert).toHaveBeenCalledWith({
        where: { userId: "user-1" },
        create: { userId: "user-1", lastOrgAlias: "cytar" },
        update: { lastOrgAlias: "cytar" },
      });
    });
  });
});
