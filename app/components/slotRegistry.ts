import type { SlotName, SlotRegistry } from "@cytario/plugin-api";

/**
 * Client slot registry. Shares the module-singleton + `__reset` shape of
 * `formatRegistry` / `gateRegistry`, but is multi-owner: `register` appends
 * rather than replacing (no scoping, no collision detection), so multiple
 * plugins may mount into the same slot; `get` returns the components in
 * registration order.
 */
class SlotRegistryImpl implements SlotRegistry {
  private readonly slots: Record<SlotName, unknown[]> = {
    "app-overlay": [],
    "app-banner": [],
  };

  register(slot: SlotName, component: unknown): void {
    // Fail at registration, not at render: a non-callable component would
    // otherwise throw deep inside React when the slot mounts.
    if (typeof component !== "function") {
      throw new TypeError(
        `Slot "${slot}" expects a component function, received ${typeof component}`,
      );
    }
    this.slots[slot].push(component);
  }

  get(slot: SlotName): unknown[] {
    return this.slots[slot];
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
