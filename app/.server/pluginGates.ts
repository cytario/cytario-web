import type { GateOutcome, GateRegistry, GateRequest, SessionGate } from "@cytario/plugin-api";

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
 * Server-only session-gate registry. Mirrors the `formatRegistry` singleton
 * pattern: a module-level instance the bootstrap injects into each plugin's
 * `ctx.gates`. Lives under a `.server` path so it never enters the client
 * bundle (gates run in middleware, before render).
 */
class GateRegistryImpl implements GateRegistry {
  private readonly gates: SessionGate[] = [];

  register(gate: SessionGate): void {
    this.gates.push(gate);
  }

  list(): readonly SessionGate[] {
    return this.gates;
  }

  /**
   * Runs registered gates in registration order and returns the first
   * non-`continue` outcome (a `redirect` or a `deny`); otherwise `continue`.
   * A throwing gate, or one returning a malformed outcome (missing/unknown
   * `kind`), is logged and treated as `continue` (fail-open, matching the
   * format-plugin containment contract).
   */
  async runGates(req: GateRequest): Promise<GateOutcome> {
    for (const gate of this.gates) {
      let outcome: GateOutcome;
      try {
        outcome = await gate(req);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[plugin-gate] gate threw — treating as continue", { error: message });
        continue;
      }
      if (!isGateOutcome(outcome)) {
        console.error("[plugin-gate] gate returned a malformed outcome — treating as continue", {
          outcome,
        });
        continue;
      }
      if (outcome.kind !== "continue") return outcome;
    }
    return { kind: "continue" };
  }

  /** Test-only: drop all registrations. */
  __reset(): void {
    this.gates.length = 0;
  }
}

export const gateRegistry = new GateRegistryImpl();

export const runGates = (req: GateRequest): Promise<GateOutcome> => gateRegistry.runGates(req);

export type { GateRegistryImpl };
