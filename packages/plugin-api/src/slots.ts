import type { Identity } from "./auth";

/** Host-defined mount points. v1 surface. */
export type SlotName = "app-overlay" | "app-banner";

/** Host runtime URLs handed to slot components for cross-app linking. */
export interface HostConfig {
  /**
   * Absolute base URL of the customer-facing portal (billing, account).
   * Optional: undefined when the host has no portal (e.g. an OSS deployment).
   * Consumers must handle its absence rather than fall back to a hardcoded origin.
   */
  portalUrl?: string;
  /** Absolute base URL of this webapp instance (the image browser). */
  webappUrl: string;
}

/**
 * Props the host passes to every slot component (client-only): the identity
 * projection and host runtime URLs. `hostConfig` is host-populated at render
 * time and always present; safe URLs only (no PII or secrets).
 */
export interface SlotProps {
  identity: Identity;
  hostConfig: HostConfig;
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
