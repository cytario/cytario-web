/**
 * A selected storage entry returned by the storage picker. The `path` is
 * relative to the connection's prefix (connection-prefix-stripped), matching
 * the convention used by `ObjectStore.list` (SDS-CY-010098).
 */
export interface StoragePickerResult {
  connectionId: string;
  /** Object key relative to the connection's prefix (no leading slash). */
  path: string;
}

/**
 * The picker always returns groups: an array of arrays, where each inner
 * array is one group of selected files. When grouping is off, each group
 * contains exactly one file. When grouping is on, the user picks a grouping
 * key and each group contains the files sharing that key. The plugin creates
 * one row (one job) per group.
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
 * Client-live; no-op sink server-side (throws "client-only" when called on
 * the server). Added additively at hostApiVersion 4.3.0; a plugin that
 * consumes only the pre-existing surface continues to satisfy the
 * CytarioPlugin contract unchanged.
 */
export interface StoragePicker {
  /**
   * Opens the host's storage picker modal. Resolves with the selected
   * groups, or `null` if the user cancelled.
   */
  open(options?: StoragePickerOptions): Promise<StoragePickerSelection | null>;
}

/**
 * Registry exposing the storage picker. Client-live; no-op sink server-side.
 */
export interface StoragePickerRegistry {
  /** The host-provided picker instance, or null on the server. */
  get(): StoragePicker | null;
}
