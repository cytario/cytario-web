import type { SlotName, SlotRegistry } from "@cytario/plugin-api";

/**
 * Client slot registry. Mirrors the `formatRegistry` / `gateRegistry`
 * singleton pattern: a module-level instance the bootstrap injects into each
 * plugin's `ctx.slots`. Slots are multi-owner — `register` appends rather than
 * replacing, so multiple plugins may mount into the same slot; `get` returns
 * the components in registration order.
 */
class SlotRegistryImpl implements SlotRegistry {
  private readonly slots: Record<SlotName, unknown[]> = {
    "app-overlay": [],
    "app-banner": [],
  };

  register(slot: SlotName, component: unknown): void {
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
