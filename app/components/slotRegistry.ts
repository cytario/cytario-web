import type { SlotName, SlotRegistry } from "@cytario/plugin-api";

interface SlotEntry {
  component: unknown;
  pluginName: string;
}

/**
 * Client slot registry: multi-owner module singleton. `scopedFor(pluginName)`
 * binds the plugin name at register time (mirrors `formatRegistry`); `register`
 * appends (no collision detection); `get` returns components in registration
 * order.
 */
class SlotRegistryImpl {
  private readonly slots: Record<SlotName, SlotEntry[]> = {
    "app-overlay": [],
    "app-banner": [],
  };

  /** Host-internal: a `SlotRegistry` adapter bound to a plugin name. */
  scopedFor(pluginName: string): SlotRegistry {
    return {
      register: (slot, component) => this.add(pluginName, slot, component),
    };
  }

  add(pluginName: string, slot: SlotName, component: unknown): void {
    // Fail here, not at render — a non-callable would throw deep inside React.
    if (typeof component !== "function") {
      throw new TypeError(
        `Plugin "${pluginName}" registered a non-component for slot "${slot}" (got ${typeof component})`,
      );
    }
    this.slots[slot].push({ component, pluginName });
  }

  get(slot: SlotName): unknown[] {
    return this.slots[slot].map((e) => e.component);
  }

  /** Test-only: drop all registrations. */
  __reset(): void {
    for (const slot of Object.keys(this.slots) as SlotName[]) {
      this.slots[slot].length = 0;
    }
  }
}

export const slotRegistry = new SlotRegistryImpl();

export type { SlotRegistryImpl };
