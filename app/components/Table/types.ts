import type { ColumnDefBase } from "@tanstack/react-table";
import { ReactNode } from "react";

// Behavior props aligned with TanStack naming
type ColumnBehavior = Pick<ColumnDefBase<unknown>, "enableResizing">;

// Sorting props (custom accessor or built-in algorithm name)
export type SortingAccessor = (rowIndex: number) => string | number | Date | null;

interface ColumnSorting {
  enableSorting?: boolean;
  sortingFn?: "alphanumeric" | "datetime" | "basic" | SortingAccessor;
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
}

export interface ColumnConfig
  extends ColumnBehavior,
    ColumnSorting,
    ColumnSizing,
    ColumnDisplay {
  id: string;
  header: string;
}

export interface TableProps {
  columns: ColumnConfig[];
  data: (string | ReactNode)[][];
  tableId?: string;
}
