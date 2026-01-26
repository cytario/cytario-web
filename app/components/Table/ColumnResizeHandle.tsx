import { Header } from "@tanstack/react-table";

import { TableRowData } from "./Table";

export const ColumnResizeHandle = ({
  header,
}: {
  header: Header<TableRowData, unknown>;
}) => {
  return (
    <button
      type="button"
      onMouseDown={header.getResizeHandler()}
      onTouchStart={header.getResizeHandler()}
      aria-label={`Resize ${header.column.columnDef.header} column`}
      className={`
        absolute top-0 right-0 h-full w-[1px]
        cursor-col-resize
        transition-colors duration-100
        z-20
        bg-slate-300
        margin-r-8
      `}
    />
  );
};
