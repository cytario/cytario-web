import { Header } from "@tanstack/react-table";

export const ColumnResizeHandle = ({ header }: { header: Header<unknown, unknown> }) => {
  return (
    <button
      type="button"
      onMouseDown={header.getResizeHandler()}
      onTouchStart={header.getResizeHandler()}
      aria-label={`Resize ${header.column.columnDef.header} column`}
      className={`
        z-20 cursor-col-resize
        absolute top-0 right-0 h-full w-2
        flex justify-end
        transition-colors duration-200
        bg-transparent hover:bg-accent active:bg-secondary
      `}
    >
      <div className="w-px h-full bg-border" />
    </button>
  );
};
