import {
  IconButton,
  Menu,
  MenuCheckboxItem,
  MenuItem,
  MenuSeparator,
} from "@cytario/design";
import type { VisibilityState } from "@tanstack/react-table";
import { Columns3 } from "lucide-react";
import type { Selection } from "react-aria-components";

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

  const selectedKeys = new Set(
    toggleableColumns
      .filter((col) => columnVisibility[col.id] !== false)
      .map((col) => col.id),
  );

  function handleSelectionChange(keys: Selection) {
    const newKeys =
      keys === "all"
        ? new Set(toggleableColumns.map((c) => c.id))
        : keys;

    for (const col of toggleableColumns) {
      const wasSelected = columnVisibility[col.id] !== false;
      const isNowSelected = newKeys.has(col.id);
      if (wasSelected !== isNowSelected) {
        toggleColumn(col.id);
      }
    }
  }

  return (
    <Menu
      selectionMode="multiple"
      selectedKeys={selectedKeys}
      onSelectionChange={handleSelectionChange}
      content={
        <>
          {toggleableColumns.map((col) => (
            <MenuCheckboxItem key={col.id} id={col.id}>
              {col.header}
            </MenuCheckboxItem>
          ))}
          <MenuSeparator />
          <MenuItem id="reset-all" onAction={() => store.getState().reset()}>
            Reset all
          </MenuItem>
        </>
      }
    >
      <IconButton
        icon={Columns3}
        variant="ghost"
        size="sm"
        aria-label="Column settings"
      />
    </Menu>
  );
}
