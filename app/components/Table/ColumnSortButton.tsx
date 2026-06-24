import { Icon } from "@cytario/design";
import { Header, SortDirection } from "@tanstack/react-table";

/** Returns Tailwind classes — visible when sorted, hidden until header hover when unsorted. */
function getStyle(sortDirection: false | SortDirection) {
  switch (sortDirection) {
    case "desc":
    case "asc":
      return "text-muted-foreground group-hover/header:text-foreground";
    default:
      return "text-muted-foreground opacity-0 group-hover/header:opacity-100";
  }
}

/** Sort indicator icon for a table column header. Shows on hover when unsorted, always visible when active. */
export const ColumnSortButton = ({ header }: { header: Header<unknown, unknown> }) => {
  const sortDirection = header.column.getIsSorted();
  const cx = getStyle(sortDirection);

  return sortDirection === "desc" ? (
    <Icon icon="ChevronUp" size="xs" className={cx} />
  ) : (
    <Icon icon="ChevronDown" size="xs" className={cx} />
  );
};
