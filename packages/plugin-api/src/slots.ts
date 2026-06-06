import type { Identity } from "./auth";

/** Host-defined mount points. v1 surface. */
export type SlotName = "app-overlay" | "app-banner";

/** Props the host passes to every slot component (client-only). */
export interface SlotProps {
  identity: Identity;
}

export interface SlotRegistry {
  // `component` is a React component type; typed as unknown here to keep
  // plugin-api React-free at the type level (matches the framework-agnostic
  // image.ts surface). Host casts to ComponentType<SlotProps>.
  //
  // Slots are multi-owner: `register` appends rather than replacing, so
  // multiple plugins may mount into the same slot. The host renders all
  // registered components in registration order. The registry implementation
  // lives in the host; this is the contract type only.
  register(slot: SlotName, component: unknown): void;
}
