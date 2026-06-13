import { Header, SortDirection } from "@tanstack/react-table";
import { ChevronDown, ChevronUp } from "lucide-react";
import { twMerge } from "tailwind-merge";

/** Returns Tailwind classes — visible when sorted, hidden until header hover when unsorted. */
function getStyle(sortDirection: false | SortDirection) {
  switch (sortDirection) {
    case "desc":
    case "asc":
      return "text-(--color-text-secondary) group-hover/header:text-(--color-text-primary)";
    default:
      return "text-(--color-text-tertiary) opacity-0 group-hover/header:opacity-100";
  }
}

/** Sort indicator icon for a table column header. Shows on hover when unsorted, always visible when active. */
export const ColumnSortButton = ({ header }: { header: Header<unknown, unknown> }) => {
  const sortDirection = header.column.getIsSorted();
  const cx = twMerge("shrink-0", getStyle(sortDirection));

  return sortDirection === "desc" ? (
    <ChevronUp size={14} className={cx} />
  ) : (
    <ChevronDown size={14} className={cx} />
  );
};
