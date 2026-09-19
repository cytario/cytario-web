import type { StoragePicker, StoragePickerRegistry } from "@cytario/plugin-api";

class StoragePickerRegistryImpl {
  private picker: StoragePicker | null = null;

  set(picker: StoragePicker): void {
    this.picker = picker;
  }

  scopedFor(): StoragePickerRegistry {
    return {
      get: () => this.picker,
    };
  }

  __reset(): void {
    this.picker = null;
  }
}

export const storagePickerRegistry = new StoragePickerRegistryImpl();

export type { StoragePickerRegistryImpl };
