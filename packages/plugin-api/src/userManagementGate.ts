import type { Identity } from "./auth";
import type { GateOutcome } from "./gates";

/**
 * Semantic user-management action a {@link UserManagementGate} consults.
 * Removal from a group is never sent to the gate (always allowed); only the
 * potentially-denying actions surface here.
 */
export type UserManagementAction =
  /** Invite one or more new members into the organization. */
  | { kind: "invite"; inviteCount: number }
  /** Add one or more existing members to a group. */
  | { kind: "addToGroup"; groupPath: string; addCount: number };

/**
 * Request the host passes to a registered {@link UserManagementGate}.
 *
 * The host computes the live member and analyst-group counts via its own
 * Keycloak admin client and passes them in; the gate does not call the host
 * back. The analyst group is the org-relative path the host reads opaquely
 * from the `analyst_group` organization attribute (the plugin assigns the
 * billing meaning); when the attribute is absent the host passes the
 * conventional default `"analysts"` so the count is still meaningful.
 */
export interface UserManagementGateRequest {
  identity: Identity;
  action: UserManagementAction;
  /** Live total member count of the active organization. */
  currentMemberCount: number;
  /** Live member count of the organization's analyst group. */
  currentAnalystCount: number;
}

/**
 * A single-slot extension point a plugin may register to consult before the
 * host commits a user-management action (invite, add-to-group). The host
 * computes the live counts and passes them with the semantic action; the
 * gate returns `continue` to allow or `deny` to block. Removals are never
 * consulted.
 *
 * Server-only: the registry is live server-side and a no-op sink
 * client-side. Added additively at hostApiVersion 6.1.0; a plugin that
 * consumes only the pre-existing surface continues to satisfy the
 * CytarioPlugin contract unchanged.
 */
export type UserManagementGate = (
  req: UserManagementGateRequest,
) => GateOutcome | Promise<GateOutcome>;

/**
 * Single-slot registry for the user-management gate. The last registration
 * wins; the host's user-management actions consult the registered gate, if
 * any, before committing. When no gate is registered (non-SaaS build, or a
 * SaaS build whose plugin does not register one) the host proceeds without
 * consulting.
 */
export interface UserManagementGateRegistry {
  register(gate: UserManagementGate): void;
}
