import { Badge, Icon, type IconValue } from "@cytario/design";
import { NavLink } from "react-router";
import { twMerge } from "tailwind-merge";

/**
 * Chrome + geometry shared by every sidebar header row — accordion sections
 * and plugin-contributed nav links — so icon and title align across row
 * types. The fixed-width leading slot holds the disclosure chevron for
 * sections and stays empty for nav rows.
 */

const ROW_CLASSES = `
  border-t border-t-accent
  flex grow
  transition-colors
  bg-background
  hover:text-foreground
  overflow-hidden
`;

const LEFT_CLASSES = `
  cursor-pointer
  flex items-center grow
  h-12 gap-1 px-2
  text-muted-foreground
  hover:text-foreground
  transition-colors
`;

export interface SectionHeaderRowProps {
  icon?: IconValue;
  title: string;
  badge?: string;
  actions?: React.ReactNode;
  /** Content of the leading disclosure slot — the chevron for sections, empty for nav rows. */
  chevronSlot?: React.ReactNode;
  /** Route target — renders the row as a link; omit for a toggle button. */
  to?: string;
  onClick?: () => void;
  /** Highlights the row: active route for links, open state for sections. */
  selected?: boolean;
  ariaExpanded?: boolean;
}

export function SectionHeaderRow({
  icon,
  title,
  badge,
  actions,
  chevronSlot,
  to,
  onClick,
  selected,
  ariaExpanded,
}: SectionHeaderRowProps) {
  const left = (
    <>
      <span aria-hidden className="flex w-4 shrink-0 items-center justify-center">
        {chevronSlot}
      </span>
      {icon && <Icon icon={icon} size="xs" />}
      <span className="truncate">{title}</span>
    </>
  );

  return (
    <div className={ROW_CLASSES}>
      {to ? (
        <NavLink
          to={to}
          onClick={onClick}
          className={({ isActive }) =>
            twMerge(LEFT_CLASSES, (isActive || selected) && "text-foreground")
          }
        >
          {left}
        </NavLink>
      ) : (
        <button
          data-expander
          type="button"
          aria-expanded={ariaExpanded}
          onClick={onClick}
          className={twMerge(LEFT_CLASSES, selected && "text-foreground")}
        >
          {left}
        </button>
      )}
      {(badge || actions) && (
        <div className="flex items-center gap-2 px-2">
          {badge && <Badge>{badge}</Badge>}
          {actions}
        </div>
      )}
    </div>
  );
}
