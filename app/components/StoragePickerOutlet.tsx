import { StoragePickerModal } from "~/components/StoragePickerModal";
import { usePickerStore, closePicker } from "~/lib/storagePickerStore";

export function StoragePickerOutlet() {
  const request = usePickerStore((s) => s.request);
  if (!request) return null;
  return (
    <StoragePickerModal
      options={request.options}
      onConfirm={(groups) => closePicker(groups)}
      onCancel={() => closePicker(null)}
    />
  );
}
