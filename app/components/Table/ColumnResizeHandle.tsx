import { Header } from "@tanstack/react-table";

export const ColumnResizeHandle = ({
  header,
}: {
  header: Header<unknown, unknown>;
}) => {
  return (
    <button
      type="button"
      onMouseDown={header.getResizeHandler()}
      onTouchStart={header.getResizeHandler()}
      aria-label={`Resize ${header.column.columnDef.header} column`}
      className={`
        absolute top-0 right-0 h-full w-4
        cursor-col-resize
        transition-colors duration-100
        z-20
        bg-transparent hover:bg-slate-100
        flex justify-end
      `}
    >
      <div className="w-0.5 h-full bg-slate-100" />
    </button>
  );
};
