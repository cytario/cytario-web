import { Header, SortDirection } from "@tanstack/react-table";
import { twMerge } from "tailwind-merge";

import { Icon } from "../Controls";

/** Returns the chevron icon name based on current sort direction. Unsorted shows up (first click = ascending). */
function getIcon(sortDirection: false | SortDirection) {
  if (sortDirection === "desc") return "ChevronDown";
  return "ChevronUp";
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
  const icon = getIcon(sortDirection);
  const cx = twMerge("shrink-0", getStyle(sortDirection));
  return <Icon icon={icon} size={14} className={cx} />;
};
