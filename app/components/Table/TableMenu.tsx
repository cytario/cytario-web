import {
  Checkbox,
  IconButton,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@cytario/design";
import type { VisibilityState } from "@tanstack/react-table";
import { Columns3 } from "lucide-react";

import { useTableStore } from "./state/useTableStore";
import { ColumnConfig } from "./types";

interface TableMenuProps {
  toggleableColumns: ColumnConfig[];
  columnVisibility: VisibilityState;
  toggleColumn: (columnId: string) => void;
  tableId: string;
}

export function TableMenu({
  toggleableColumns,
  columnVisibility,
  toggleColumn,
  tableId,
}: TableMenuProps) {
  const store = useTableStore(tableId);

  return (
    <Popover>
      <PopoverTrigger>
        <IconButton
          icon={Columns3}
          variant="ghost"
          size="sm"
          aria-label="Column settings"
        />
      </PopoverTrigger>
      <PopoverContent placement="bottom start" className="min-w-48 p-1">
        {toggleableColumns.map((col) => (
          <button
            key={col.id}
            type="button"
            onClick={() => toggleColumn(col.id)}
            className="flex w-full items-center gap-2 px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-100 rounded"
          >
            <Checkbox
              isSelected={columnVisibility[col.id] !== false}
              slot={null}
            />
            {col.header}
          </button>
        ))}
        <div className="my-1 h-px bg-slate-200" />
        <button
          type="button"
          onClick={() => store.getState().reset()}
          className="flex w-full items-center px-2 py-1.5 text-sm text-slate-500 hover:bg-slate-100 rounded"
        >
          Reset all
        </button>
      </PopoverContent>
    </Popover>
  );
}
