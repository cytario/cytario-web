import type { Identity, UserManagementAction } from "@cytario/plugin-api";
import { userMgmtGateRegistry } from "~/.server/userManagementGateRegistry";

/**
 * Consults the registered user-management gate (if any) before the host
 * commits a user-management action (SDS-CY-010919). The gate checks the
 * identity's `subscription_status` and `subscription_tier`; it returns
 * `continue` to allow or `deny` to block. When no gate is registered
 * (non-SaaS build, or a SaaS build whose plugin does not register one) this
 * returns early and the action proceeds without consulting.
 */

/** Throws a `Response` (status 402 by default) when the gate denies. */
export async function consultUserMgmtGate(
  identity: Identity,
  action: UserManagementAction,
): Promise<void> {
  if (!userMgmtGateRegistry.hasGate()) return;
  const orgTier = readOrgTier(identity);
  const outcome = await userMgmtGateRegistry.consult({ identity, action, orgTier });
  if (!outcome || outcome.kind === "continue") return;
  if (outcome.kind === "deny") {
    throw new Response(
      JSON.stringify({
        error: outcome.message ?? "User-management action denied by gate.",
        resolveLabel: outcome.resolveLabel,
        resolveUrl: outcome.resolveUrl,
      }),
      {
        status: outcome.status ?? 402,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}

function readOrgTier(identity: Identity): string | undefined {
  return identity.organizationAttributes["subscription_tier"]?.[0];
}
