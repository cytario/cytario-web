import { ReactNode } from "react";

export interface ColumnConfig {
  id: string; // Unique identifier (e.g., "name", "size")
  header: string; // Display name
  defaultWidth: number; // Default width in px
  minWidth?: number; // Min width (default: 48)
  maxWidth?: number; // Max width (default: 500)
  align?: "left" | "right" | "center"; // Text alignment
  enableResizing?: boolean; // Allow resize (default: true)
  monospace?: boolean; // Use monospace font (default: false)
  sortable?: boolean; // Enable/disable sorting for this column (default: false)
  sortType?:
    | "alphanumeric"
    | "datetime"
    | "basic"
    | ((rowIndex: number) => string | number | Date | null); // Sorting algorithm or custom accessor function
}

export interface TableProps {
  columns: ColumnConfig[];
  data: (string | ReactNode)[][];
  tableId?: string;
}
