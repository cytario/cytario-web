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

interface GateEntry {
  gate: SessionGate;
  pluginName: string;
}

// The plugin name is bound at register time (never accepted from plugin
// code) so a gate throwing at request time can be attributed.
class GateRegistryImpl {
  private readonly entries: GateEntry[] = [];

  scopedFor(pluginName: string): GateRegistry {
    return {
      register: (gate) => this.add(pluginName, gate),
    };
  }

  add(pluginName: string, gate: SessionGate): void {
    this.entries.push({ gate, pluginName });
  }

  list(): readonly SessionGate[] {
    return this.entries.map((e) => e.gate);
  }

  // A throwing or malformed gate is treated as `continue` — fail-open,
  // matching the plugin containment contract.
  async runGates(req: GateRequest): Promise<GateOutcome> {
    // Snapshot so a gate registering re-entrantly mid-run cannot change the iterated set.
    for (const { gate, pluginName } of [...this.entries]) {
      let outcome: GateOutcome;
      try {
        outcome = await gate(req);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[plugin-gate] "${pluginName}" threw — treating as continue`, {
          error: message,
        });
        continue;
      }
      if (!isGateOutcome(outcome)) {
        console.error(
          `[plugin-gate] "${pluginName}" returned a malformed outcome — treating as continue`,
          { outcome },
        );
        continue;
      }
      if (outcome.kind !== "continue") return outcome;
    }
    return { kind: "continue" };
  }

  /** Test-only: drop all registrations. */
  __reset(): void {
    this.entries.length = 0;
  }
}

export const gateRegistry = new GateRegistryImpl();

export const runGates = (req: GateRequest): Promise<GateOutcome> => gateRegistry.runGates(req);

export type { GateRegistryImpl };
