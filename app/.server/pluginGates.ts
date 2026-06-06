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

/**
 * Server-only session-gate registry. Mirrors the `formatRegistry` singleton
 * pattern: `scopedFor(pluginName)` binds the plugin name at register time (the
 * public `GateRegistry` surface never accepts it from plugin code), so a gate
 * throwing at request time can be attributed. Lives under a `.server` path so
 * it never enters the client bundle.
 */
class GateRegistryImpl {
  private readonly entries: GateEntry[] = [];

  /** Host-internal: a `GateRegistry` adapter bound to a plugin name. */
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

  /**
   * Runs registered gates in registration order and returns the first
   * non-`continue` outcome (a `redirect` or a `deny`); otherwise `continue`.
   * A throwing gate, or one returning a malformed outcome (missing/unknown
   * `kind`), is logged with its plugin name and treated as `continue`
   * (fail-open, matching the format-plugin containment contract).
   */
  async runGates(req: GateRequest): Promise<GateOutcome> {
    // Snapshot so a gate registering re-entrantly mid-run cannot change the
    // iterated set.
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
