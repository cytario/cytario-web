import { Header } from "@tanstack/react-table";

import { Icon } from "../Controls";

export const ColumnSortButton = ({
  header,
}: {
  header: Header<unknown, unknown>;
}) => {
  const sortDirection = header.column.getIsSorted();

  if (sortDirection === "asc") {
    return (
      <Icon
        icon="ChevronDown"
        size={14}
        className="shrink-0 text-slate-700 group-hover/header:text-slate-900"
      />
    );
  }

  if (sortDirection === "desc") {
    return (
      <Icon
        icon="ChevronUp"
        size={14}
        className="shrink-0 text-slate-700 group-hover/header:text-slate-900"
      />
    );
  }

  return (
    <Icon
      icon="ChevronDown"
      size={14}
      className="shrink-0 opacity-0 group-hover/header:opacity-100 text-slate-300"
    />
  );
};
