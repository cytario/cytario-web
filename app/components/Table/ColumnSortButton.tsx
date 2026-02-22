import { Header, SortDirection } from "@tanstack/react-table";
import { ChevronDown, ChevronUp } from "lucide-react";
import { twMerge } from "tailwind-merge";

/** Returns the chevron icon based on current sort direction. */
function getIcon(sortDirection: false | SortDirection) {
  if (sortDirection === "desc") return ChevronUp;
  return ChevronDown;
}

/** Returns Tailwind classes — visible when sorted, hidden until header hover when unsorted. */
function getStyle(sortDirection: false | SortDirection) {
  switch (sortDirection) {
    case "desc":
    case "asc":
      return "text-slate-700 group-hover/header:text-slate-900";
    default:
      return "text-slate-500 opacity-0 group-hover/header:opacity-100";
  }
}

/** Sort indicator icon for a table column header. Shows on hover when unsorted, always visible when active. */
export const ColumnSortButton = ({
  header,
}: {
  header: Header<unknown, unknown>;
}) => {
  const sortDirection = header.column.getIsSorted();
  const IconComponent = getIcon(sortDirection);
  const cx = twMerge("shrink-0", getStyle(sortDirection));
  return <IconComponent size={14} className={cx} />;
};
