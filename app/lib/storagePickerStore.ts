import { create } from "zustand";

import type { StoragePickerOptions, StoragePickerSelection } from "@cytario/plugin-api";

interface PickerRequest {
  options: StoragePickerOptions;
  resolve: (results: StoragePickerSelection | null) => void;
}

interface PickerStore {
  request: PickerRequest | null;
  open: (options: StoragePickerOptions, resolve: PickerRequest["resolve"]) => void;
  close: (result: StoragePickerSelection | null) => void;
}

const pickerStore = create<PickerStore>((set) => ({
  request: null,
  open: (options, resolve) => set({ request: { options, resolve } }),
  close: (result) => {
    set((state) => {
      state.request?.resolve(result);
      return { request: null };
    });
  },
}));

export const usePickerStore = pickerStore;

export function openPicker(options: StoragePickerOptions): Promise<StoragePickerSelection | null> {
  return new Promise((resolve) => {
    pickerStore.getState().open(options, resolve);
  });
}

export function closePicker(result: StoragePickerSelection | null): void {
  pickerStore.getState().close(result);
}
