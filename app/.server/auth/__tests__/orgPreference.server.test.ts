import { getPreferredOrg, setPreferredOrg } from "../orgPreference.server";
import { prisma } from "~/.server/db/prisma";

const row = (value: unknown) => ({
  userId: "user-1",
  key: "lastOrgAlias",
  value,
  updatedAt: new Date(),
});

describe("orgPreference", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getPreferredOrg", () => {
    test("returns the stored alias", async () => {
      vi.spyOn(prisma.userPreference, "findUnique").mockResolvedValue(row("vericura") as never);

      await expect(getPreferredOrg("user-1")).resolves.toBe("vericura");
      expect(prisma.userPreference.findUnique).toHaveBeenCalledWith({
        where: { userId_key: { userId: "user-1", key: "lastOrgAlias" } },
      });
    });

    test("returns null when the user has no history", async () => {
      vi.spyOn(prisma.userPreference, "findUnique").mockResolvedValue(null);

      await expect(getPreferredOrg("user-2")).resolves.toBeNull();
    });

    test("returns null for a non-string stored value", async () => {
      vi.spyOn(prisma.userPreference, "findUnique").mockResolvedValue(
        row({ alias: "vericura" }) as never,
      );

      await expect(getPreferredOrg("user-1")).resolves.toBeNull();
    });
  });

  describe("setPreferredOrg", () => {
    test("upserts the lastOrgAlias preference entry", async () => {
      vi.spyOn(prisma.userPreference, "upsert").mockResolvedValue(row("cytar") as never);

      await setPreferredOrg("user-1", "cytar");

      expect(prisma.userPreference.upsert).toHaveBeenCalledWith({
        where: { userId_key: { userId: "user-1", key: "lastOrgAlias" } },
        create: { userId: "user-1", key: "lastOrgAlias", value: "cytar" },
        update: { value: "cytar" },
      });
    });
  });
});
