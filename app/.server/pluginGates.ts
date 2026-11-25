import type { GateOutcome, GateRegistry, GateRequest, SessionGate } from "@cytario/plugin-api";

const GATE_OUTCOME_KINDS = new Set<GateOutcome["kind"]>(["continue", "redirect", "deny", "lock"]);

function isGateOutcome(value: unknown): value is GateOutcome {
  if (typeof value !== "object" || value === null || !("kind" in value)) return false;
  const outcome = value as GateOutcome;
  if (!GATE_OUTCOME_KINDS.has(outcome.kind)) return false;
  // A lock outcome's ids reach the renderer verbatim, so a malformed list is a
  // containment failure, not something to pass through and hope about.
  if (outcome.kind === "lock") {
    return (
      Array.isArray(outcome.connectionIds) &&
      outcome.connectionIds.every((id) => typeof id === "string")
    );
  }
  return true;
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

  /** Whether any plugin registered a gate — the host skips fact resolution when not. */
  hasEntries(): boolean {
    return this.entries.length > 0;
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

/** No plugin gates in this build: the host can skip resolving their input. */
export const hasGates = (): boolean => gateRegistry.hasEntries();

export type { GateRegistryImpl };
