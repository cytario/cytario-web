import type {
  GateOutcome,
  UserManagementGate,
  UserManagementGateRegistry,
  UserManagementGateRequest,
} from "@cytario/plugin-api";

const GATE_OUTCOME_KINDS = new Set<GateOutcome["kind"]>(["continue", "redirect", "deny"]);

function isGateOutcome(value: unknown): value is GateOutcome {
  return (
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    GATE_OUTCOME_KINDS.has((value as { kind: GateOutcome["kind"] }).kind)
  );
}

/**
 * Server-only single-slot registry for the user-management gate
 * (SDS-CY-010919). The last registration wins; the host's user-management
 * actions consult the registered gate, if any, before committing. When no
 * gate is registered (non-SaaS build, or a SaaS build whose plugin does not
 * register one) {@link consultUserMgmtGate} returns `null` and the action
 * proceeds without consulting.
 *
 * Lives under a `.server` path so it never enters the client bundle.
 */
class UserManagementGateRegistryImpl implements UserManagementGateRegistry {
  private gate: UserManagementGate | null = null;

  register(gate: UserManagementGate): void {
    this.gate = gate;
  }

  hasGate(): boolean {
    return this.gate !== null;
  }

  /**
   * Consults the registered gate. Returns `null` when no gate is registered
   * (no SaaS entitlement surface). A throwing gate, or one returning a
   * malformed outcome, is logged and treated as `continue` (fail-open,
   * matching the session-gate containment contract).
   */
  async consult(req: UserManagementGateRequest): Promise<GateOutcome | null> {
    if (!this.gate) return null;
    let outcome: GateOutcome;
    try {
      outcome = await this.gate(req);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[user-mgmt-gate] gate threw - treating as continue", { error: message });
      return { kind: "continue" };
    }
    if (!isGateOutcome(outcome)) {
      console.error("[user-mgmt-gate] gate returned a malformed outcome - treating as continue", {
        outcome,
      });
      return { kind: "continue" };
    }
    return outcome;
  }

  /** Test-only: drop the registration. */
  __reset(): void {
    this.gate = null;
  }
}

export const userMgmtGateRegistry = new UserManagementGateRegistryImpl();
