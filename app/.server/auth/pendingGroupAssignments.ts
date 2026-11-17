import type { UserProfile } from "./getUserInfo";
import {
  addUserToOrganizationGroup,
  findOrganizationByAlias,
  findOrganizationGroupByPath,
} from "./keycloakAdmin";
import { prisma } from "../db/prisma";

/**
 * Keycloak invitations expire after this long; a pending assignment older than
 * the invitation validity can never correspond to a still-claimable invite, so
 * the apply lookup prunes it. Kept in step with the realm's invitation TTL.
 */
const PENDING_ASSIGNMENT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface PendingGroupAssignmentRow {
  id: string;
  organization: string;
  groupPath: string;
}

export async function createPendingGroupAssignments(
  organization: string,
  emails: readonly string[],
  groupPaths: readonly string[],
  invitedBy: string,
): Promise<void> {
  const normalizedEmails = [...new Set(emails.map((email) => email.trim().toLowerCase()))];
  const paths = [...new Set(groupPaths)];
  if (normalizedEmails.length === 0 || paths.length === 0) return;

  await prisma.pendingGroupAssignment.createMany({
    data: normalizedEmails.flatMap((email) =>
      paths.map((groupPath) => ({ organization, email, groupPath, invitedBy })),
    ),
    // A re-invite of an email that already has a pending assignment (the 409
    // path) hits the unique key; the existing rows already say what to do.
    skipDuplicates: true,
  });
}

/**
 * Applies the user's pending group assignments in the given member
 * organizations and reports whether any membership was added (so the auth
 * callback can refresh the session to pick up the new group claims).
 * Rows are deleted once applied or once their group no longer exists; rows
 * hit by a transient identity-service failure stay for the next login and
 * expire with the TTL.
 */
export async function applyPendingGroupAssignments(
  user: UserProfile,
  organizations: readonly string[],
): Promise<boolean> {
  // Rows key on email alone, so only a verified address may claim them.
  if (!user.email || !user.email_verified || organizations.length === 0) return false;

  const email = user.email.trim().toLowerCase();

  const ttlCutoff = new Date(Date.now() - PENDING_ASSIGNMENT_TTL_MS);
  await prisma.pendingGroupAssignment.deleteMany({
    where: { organization: { in: [...organizations] }, createdAt: { lt: ttlCutoff } },
  });

  const pending = await prisma.pendingGroupAssignment.findMany({
    where: { organization: { in: [...organizations] }, email },
    orderBy: { createdAt: "asc" },
  });
  if (pending.length === 0) return false;

  const rowsByOrganization = new Map<string, PendingGroupAssignmentRow[]>();
  for (const row of pending) {
    rowsByOrganization.set(row.organization, [
      ...(rowsByOrganization.get(row.organization) ?? []),
      row,
    ]);
  }

  let applied = false;
  const resolvedIds: string[] = [];
  for (const [organization, rows] of rowsByOrganization) {
    try {
      const outcome = await applyOrganizationAssignments(user.sub, organization, rows);
      applied ||= outcome.applied;
      resolvedIds.push(...outcome.resolvedIds);
    } catch (error) {
      console.error(`Pending group assignments failed in ${organization}:`, error);
    }
  }

  if (resolvedIds.length > 0) {
    await prisma.pendingGroupAssignment.deleteMany({ where: { id: { in: resolvedIds } } });
  }

  return applied;
}

async function applyOrganizationAssignments(
  userId: string,
  organization: string,
  rows: readonly PendingGroupAssignmentRow[],
): Promise<{ applied: boolean; resolvedIds: string[] }> {
  const org = await findOrganizationByAlias(organization);
  if (!org) {
    console.error(`Pending group assignments kept: organization ${organization} not found`);
    return { applied: false, resolvedIds: [] };
  }

  let applied = false;
  const resolvedIds: string[] = [];
  for (const row of rows) {
    const group = await findOrganizationGroupByPath(org.id, row.groupPath);
    if (!group) {
      console.warn(
        `Pending group assignment dropped: group ${row.groupPath} no longer exists in ${organization}`,
      );
      resolvedIds.push(row.id);
      continue;
    }
    try {
      await addUserToOrganizationGroup(org.id, group.id, userId);
      applied = true;
      resolvedIds.push(row.id);
    } catch (error) {
      console.error(
        `Pending group assignment kept: add failed for ${row.groupPath} in ${organization}:`,
        error,
      );
    }
  }
  return { applied, resolvedIds };
}
