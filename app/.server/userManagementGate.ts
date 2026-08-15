import type {
  Identity,
  UserManagementAction,
  UserManagementGateRequest,
} from "@cytario/plugin-api";
import {
  findOrganizationGroupByPath,
  getOrganizationGroupMembers,
  getOrganizationMembers,
} from "~/.server/auth/keycloakAdmin";
import { userMgmtGateRegistry } from "~/.server/userManagementGateRegistry";

/**
 * Consults the registered user-management gate (if any) before the host
 * commits a user-management action (C-387, SDS-CY-010919). The host computes
 * the live member and analyst-group counts via its Keycloak admin client and
 * passes them with the semantic action; the gate returns `continue` to allow
 * or `deny` to block. When no gate is registered (non-SaaS build, or a SaaS
 * build whose plugin does not register one) this returns `null` and the
 * action proceeds without consulting.
 *
 * The analyst group is read opaquely from the `analyst_group` organization
 * attribute (the plugin assigns the billing meaning); when the attribute is
 * absent the conventional default `"analysts"` is used so the count is still
 * meaningful.
 */

/** Throws a `Response` (status 409 by default) when the gate denies. */
export async function consultUserMgmtGate(
  identity: Identity,
  orgId: string,
  action: UserManagementAction,
): Promise<void> {
  if (!userMgmtGateRegistry.hasGate()) return;

  const analystGroupPath = identity.organizationAttributes["analyst_group"]?.[0] ?? "analysts";

  const [members, analystGroup] = await Promise.all([
    getOrganizationMembers(orgId),
    findOrganizationGroupByPath(orgId, analystGroupPath),
  ]);
  const currentMemberCount = members.length;
  const currentAnalystCount = analystGroup
    ? (await getOrganizationGroupMembers(orgId, analystGroup.id)).length
    : 0;

  const req: UserManagementGateRequest = {
    identity,
    action,
    currentMemberCount,
    currentAnalystCount,
  };

  const outcome = await userMgmtGateRegistry.consult(req);
  if (!outcome || outcome.kind === "continue") return;
  if (outcome.kind === "deny") {
    throw new Response(outcome.message ?? "User-management action denied by gate.", {
      status: outcome.status ?? 409,
    });
  }
  // redirect outcomes are not meaningful for a user-management action; ignore.
}
