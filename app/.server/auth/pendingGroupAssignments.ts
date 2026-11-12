import type { UserProfile } from "./getUserInfo";
import { addUserToOrganizationGroup, findOrganizationGroupByPath } from "./keycloakAdmin";
import { prisma } from "../db/prisma";

/**
 * Keycloak invitations expire after this long; a pending assignment older than
 * the invitation validity can never correspond to a still-claimable invite, so
 * the apply lookup prunes it. Kept in step with the realm's invitation TTL.
 */
const PENDING_ASSIGNMENT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function createPendingGroupAssignments(
  organization: string,
  email: string,
  groupPaths: readonly string[],
  invitedBy: string,
): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();
  const paths = [...new Set(groupPaths)];
  if (paths.length === 0) return;

  await prisma.pendingGroupAssignment.createMany({
    data: paths.map((groupPath) => ({
      organization,
      email: normalizedEmail,
      groupPath,
      invitedBy,
    })),
    // A re-invite of an email that already has a pending assignment (the 409
    // path) hits the unique key; the existing rows already say what to do.
    skipDuplicates: true,
  });
}

/**
 * Applies every pending group assignment recorded for the given organization
 * and the user's email, deletes the applied rows, and reports whether
 * anything was applied (so the auth callback can re-establish the session and
 * pick up the new group claims). Failures to add a group are tolerated — the
 * rows still go, because a half-applied batch must not replay on every login.
 */
export async function applyPendingGroupAssignments(
  user: UserProfile,
  organization: string,
): Promise<boolean> {
  if (!user.email) return false;

  const email = user.email.trim().toLowerCase();

  const ttlCutoff = new Date(Date.now() - PENDING_ASSIGNMENT_TTL_MS);
  await prisma.pendingGroupAssignment.deleteMany({
    where: { organization, createdAt: { lt: ttlCutoff } },
  });

  const pending = await prisma.pendingGroupAssignment.findMany({
    where: { organization, email },
    orderBy: { createdAt: "asc" },
  });
  if (pending.length === 0) return false;

  const org = await findOrganizationGroupByPath(organization, organization);
  const orgId = org?.id;
  if (orgId) {
    for (const assignment of pending) {
      const group = await findOrganizationGroupByPath(organization, assignment.groupPath);
      if (!group) {
        console.warn(
          `Pending group assignment dropped: group ${assignment.groupPath} no longer exists in ${organization}`,
        );
        continue;
      }
      try {
        await addUserToOrganizationGroup(orgId, group.id, user.sub);
      } catch (error) {
        console.error(
          `Pending group assignment add failed for ${assignment.groupPath} in ${organization}:`,
          error,
        );
      }
    }
  } else {
    console.error(
      `Pending group assignments dropped: organization ${organization} not found in identity service`,
    );
  }

  // Every fetched row goes, whatever happened to its add — a half-applied
  // batch must not replay on every login.
  await prisma.pendingGroupAssignment.deleteMany({
    where: { id: { in: pending.map((p) => p.id) } },
  });

  return true;
}
