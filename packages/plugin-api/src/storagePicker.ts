/**
 * A selected storage entry returned by the storage picker. The `path` is
 * relative to the connection's prefix, matching the convention used by
 * `ObjectStore.list`.
 */
export interface StoragePickerResult {
  connectionId: string;
  /**
   * Object key relative to the connection's prefix (no leading slash). In
   * folder mode, the folder's prefix instead — always trailing slash, empty
   * at the connection root — so it feeds `ObjectStore.list` unchanged. A
   * caller composes an object key inside the folder by appending the file
   * name directly.
   */
  path: string;
}

/**
 * The picker always returns groups: an array of arrays, where each inner
 * array is one group of selected files. When grouping is off, each group
 * contains exactly one file. When grouping is on, the user picks a grouping
 * key and each group contains the files sharing that key. The plugin creates
 * one row (one job) per group. Folder mode returns exactly one group holding
 * exactly one folder result, so a caller reads it uniformly.
 */
export type StoragePickerSelection = StoragePickerResult[][];

/**
 * Options for the storage picker modal.
 */
export interface StoragePickerOptions {
  /** The connection to open the picker at; if omitted, the user picks one. */
  connectionId?: string;
  /** Initial path within the connection (relative to the connection prefix). */
  initialPath?: string;
  /**
   * What the picker selects. `"files"` (default) selects files; `"folder"`
   * selects a single destination folder. The tree's root is always the
   * connection root, so a folder anywhere in the connection is reachable;
   * `initialPath` only pre-reveals and pre-selects the folder to open at.
   * `multiple`, `globFilter` and `groupBy` describe file selection and are
   * ignored in folder mode.
   */
  select?: "files" | "folder";
  /** Allow selecting multiple files. Default true. */
  multiple?: boolean;
  /** Show an optional glob-filter input that highlights matching files and
   * enables an "Add all" action to select every match at once. Default false. */
  globFilter?: boolean;
  /** Show a group-by key selector so the user can group selected files into
   * multi-file groups (one group = one row = one multi-input job). When false
   * (default), each selected file is its own group. */
  groupBy?: boolean;
}

/**
 * Client-side storage picker — lets a plugin ask the host to open its native
 * S3 browser tree in a picker modal and return the selected files as groups.
 * The host renders its existing DirectoryViewTree (single implementation)
 * with multi-select checkboxes, an optional glob filter, an optional
 * group-by selector, and an "Add" confirm button.
 *
 * Client-live; `null` in the server realm (reached through `ctx.client`).
 */
export interface StoragePicker {
  /**
   * Opens the host's storage picker modal. Resolves with the selected
   * groups, or `null` if the user cancelled.
   */
  open(options?: StoragePickerOptions): Promise<StoragePickerSelection | null>;
}
