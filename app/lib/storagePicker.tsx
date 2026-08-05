import type { StoragePicker } from "@cytario/plugin-api";
import { openPicker } from "~/lib/storagePickerStore";

class StoragePickerImpl implements StoragePicker {
  open(options?: Parameters<StoragePicker["open"]>[0]) {
    return openPicker(options ?? {});
  }
}

export const storagePicker = new StoragePickerImpl();
