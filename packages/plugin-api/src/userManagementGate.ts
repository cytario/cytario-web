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
  | { kind: "addToGroup"; groupPath: string; addCount: number }
  /** Run an image-processing analysis. */
  | { kind: "runAnalysis" };

/**
 * The organization's subscription tier, read from the `subscription_tier`
 * organization attribute. Opaque to the host — the plugin interprets the
 * value; the host passes it through without inspecting it.
 */
export type OrgTier = string;

/**
 * Request the host passes to a registered {@link UserManagementGate}.
 *
 * The gate checks the `subscription_status` and `subscription_tier`
 * organization attributes. The identity carries the PII-free user profile and
 * its organization attributes.
 */
export interface UserManagementGateRequest {
  identity: Identity;
  action: UserManagementAction;
  /** The org's subscription tier, derived from the `subscription_tier` org attribute. Undefined when the attribute is absent. */
  orgTier?: OrgTier;
}

/**
 * A single-slot extension point a plugin may register to consult before the
 * host commits a user-management action (invite, add-to-group). The gate
 * checks the identity's `subscription_status` and returns `continue` to allow
 * or `deny` to block. Removals are never consulted.
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
