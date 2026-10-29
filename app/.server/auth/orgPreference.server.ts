import { prisma } from "../db/prisma";

/** The org alias this user last worked in, or null when they have no history. */
export async function getPreferredOrg(userId: string): Promise<string | null> {
  const preference = await prisma.userOrgPreference.findUnique({ where: { userId } });
  return preference?.lastOrgAlias ?? null;
}

/** Records `alias` as the user's last-used org; one row per user. */
export async function setPreferredOrg(userId: string, alias: string): Promise<void> {
  await prisma.userOrgPreference.upsert({
    where: { userId },
    create: { userId, lastOrgAlias: alias },
    update: { lastOrgAlias: alias },
  });
}
