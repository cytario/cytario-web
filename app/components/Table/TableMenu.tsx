import {
  Menu,
  MenuButton,
  MenuItem,
  MenuItems,
  MenuSeparator,
} from "@headlessui/react";
import type { VisibilityState } from "@tanstack/react-table";

import { useTableStore } from "./state/useTableStore";
import { ColumnConfig } from "./types";
import { Checkbox, IconButton } from "../Controls";

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
    <Menu>
      <MenuButton
        as={IconButton}
        icon="Columns3"
        theme="white"
        label="Column settings"
        scale="small"
      />
      <MenuItems
        anchor="bottom start"
        className="z-20 min-w-48 p-1 bg-white border border-slate-300 rounded-sm shadow-lg"
      >
        {toggleableColumns.map((col) => (
          <MenuItem key={col.id} as="div">
            <button
              type="button"
              onClick={() => toggleColumn(col.id)}
              className="flex w-full items-center gap-2 px-2 py-1.5 text-sm text-slate-700 data-[focus]:bg-slate-100 rounded"
            >
              <Checkbox checked={columnVisibility[col.id] !== false} />
              {col.header}
            </button>
          </MenuItem>
        ))}
        <MenuSeparator className="my-1 h-px bg-slate-200" />
        <MenuItem as="div">
          <button
            type="button"
            onClick={() => store.getState().reset()}
            className="flex w-full items-center px-2 py-1.5 text-sm text-slate-500 data-[focus]:bg-slate-100 rounded"
          >
            Reset all
          </button>
        </MenuItem>
      </MenuItems>
    </Menu>
  );
}
