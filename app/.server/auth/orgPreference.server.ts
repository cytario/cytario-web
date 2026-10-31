import { prisma } from "../db/prisma";

/**
 * The org alias this user last worked in, or null when they have no history.
 * Stored as one `UserPreference` entry under `lastOrgAlias`.
 */
export async function getPreferredOrg(userId: string): Promise<string | null> {
  const preference = await prisma.userPreference.findUnique({
    where: { userId_key: { userId, key: "lastOrgAlias" } },
  });
  return typeof preference?.value === "string" ? preference.value : null;
}

/** Records `alias` as the user's last-used org; one entry per user. */
export async function setPreferredOrg(userId: string, alias: string): Promise<void> {
  await prisma.userPreference.upsert({
    where: { userId_key: { userId, key: "lastOrgAlias" } },
    create: { userId, key: "lastOrgAlias", value: alias },
    update: { value: alias },
  });
}
