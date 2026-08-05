import type { StoragePicker, StoragePickerRegistry } from "@cytario/plugin-api";

/**
 * Client-side storage picker registry: a module singleton holding the
 * host-provided StoragePicker instance. The host calls `set(picker)` during
 * client bootstrap to install the native S3 browser picker; plugins call
 * `scopedFor(name).get()` to retrieve it. Client-only — the server entry
 * receives a no-op sink whose `get()` returns null.
 *
 * Added additively at hostApiVersion 4.3.0 (SDS-CY-010918).
 */
class StoragePickerRegistryImpl {
  private picker: StoragePicker | null = null;

  /** Host-internal: install the picker instance. */
  set(picker: StoragePicker): void {
    this.picker = picker;
  }

  scopedFor(): StoragePickerRegistry {
    return {
      get: () => this.picker,
    };
  }

  /** Test-only. */
  __reset(): void {
    this.picker = null;
  }
}

export const storagePickerRegistry = new StoragePickerRegistryImpl();

export type { StoragePickerRegistryImpl };
