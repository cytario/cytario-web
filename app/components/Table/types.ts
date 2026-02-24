import type { ColumnDefBase } from "@tanstack/react-table";
import { ReactNode } from "react";

import type { TreeNode } from "../Controls";

// Behavior props aligned with TanStack naming
type ColumnBehavior = Pick<ColumnDefBase<unknown>, "enableResizing">;

// Sorting props (built-in algorithm names only; with typed data, custom
// SortingAccessor functions are no longer needed)
interface ColumnSorting {
  enableSorting?: boolean;
  sortingFn?: "alphanumeric" | "datetime" | "basic" | "boolean";
}

// Sizing props (aligned with TanStack naming)
interface ColumnSizing {
  size: number; // Default width in px
  minSize?: number; // Min width (default: 48)
  maxSize?: number; // Max width (default: MAX_SAFE_INTEGER)
}

// Display props (custom, not in TanStack)
interface ColumnDisplay {
  align?: "left" | "right" | "center";
  monospace?: boolean;
  ellipsis?: "left" | "middle" | "right";
}

// Filtering props
interface ColumnFiltering {
  enableColumnFilter?: boolean;
  filterType?: "text" | "select";
  filterOptions?: { label: string; value: string }[];
  filterTree?: TreeNode;
}

// Visibility props
interface ColumnVisibility {
  defaultVisible?: boolean; // defaults to true if omitted
  anchor?: boolean; // always visible, cannot be hidden
}

export interface ColumnConfig
  extends ColumnBehavior,
    ColumnSorting,
    ColumnSizing,
    ColumnDisplay,
    ColumnFiltering,
    ColumnVisibility {
  id: string;
  header: string;
}

/**
 * Maps column IDs to render functions. Each function receives the full typed
 * row object and returns a ReactNode. Columns without a renderer display
 * their raw accessor value.
 */
export type CellRenderers<TData> = Partial<
  Record<string, (row: TData) => ReactNode>
>;

export interface TableProps<TData extends Record<string, unknown>> {
  columns: ColumnConfig[];
  data: TData[];
  cellRenderers?: CellRenderers<TData>;
  tableId?: string;
}
