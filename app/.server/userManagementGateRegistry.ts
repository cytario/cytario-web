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

// Single-slot registry: the last registration wins; the host's user-management
// actions consult the registered gate, if any, before committing.
class UserManagementGateRegistryImpl implements UserManagementGateRegistry {
  private gate: UserManagementGate | null = null;

  register(gate: UserManagementGate): void {
    this.gate = gate;
  }

  hasGate(): boolean {
    return this.gate !== null;
  }

  // A throwing gate, or one returning a malformed outcome, is logged and
  // treated as `continue` (fail-open, matching the session-gate containment).
  // Returns `null` when no gate is registered.
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
