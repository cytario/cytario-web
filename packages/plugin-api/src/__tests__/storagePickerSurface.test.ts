import type { StoragePickerOptions, StoragePickerResult } from "../storagePicker";

test("StoragePickerOptions accepts the folder selection mode (SDS-CY-010918)", async () => {
  const mod = await import("../index");
  // Type-only surface: no runtime export was added alongside the type.
  expect((mod as Record<string, unknown>).StoragePickerOptions).toBeUndefined();
  expect((mod as Record<string, unknown>).StoragePickerResult).toBeUndefined();

  const options: StoragePickerOptions = { select: "folder" };
  expect(options.select).toBe("folder");
});

test("an options object predating the field still satisfies the type (absent ⇒ files)", () => {
  const legacy: StoragePickerOptions = { multiple: true };
  expect(legacy.select).toBeUndefined();
});

test("the value set is the closed union (files, folder)", () => {
  const modes: NonNullable<StoragePickerOptions["select"]>[] = ["files", "folder"];
  expect(modes).toHaveLength(2);
});

test("a folder destination is expressed as a prefix-relative path", () => {
  const folder: StoragePickerResult = { connectionId: "conn-1", path: "configs/jobs/" };
  const root: StoragePickerResult = { connectionId: "conn-1", path: "" };
  expect(folder.path.endsWith("/")).toBe(true);
  expect(root.path).toBe("");
});
