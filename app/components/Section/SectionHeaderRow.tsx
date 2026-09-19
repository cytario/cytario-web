import { Badge, Icon, type IconValue } from "@cytario/design";
import { motion } from "motion/react";
import { NavLink } from "react-router";
import { twMerge } from "tailwind-merge";

/**
 * Chrome + geometry shared by every sidebar header row — accordion sections
 * and plugin-contributed nav links — so icon and title align across row
 * types. The fixed-width leading slot holds the disclosure chevron for
 * sections and stays empty for nav rows. With neither `to` nor `onClick` the
 * row is static chrome, not a control.
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
  h-10 gap-1 px-2
  text-muted-foreground
  hover:text-foreground
  transition-colors
  outline-none focus-visible:outline focus-visible:outline-ring -outline-offset-2
`;

export interface SectionHeaderRowProps {
  icon?: IconValue;
  title: string;
  /** Set when something else labels itself from this title, e.g. a floating panel. */
  titleId?: string;
  badge?: string;
  actions?: React.ReactNode;
  /** Content of the leading disclosure slot — the chevron for sections, empty for nav rows. */
  chevronSlot?: React.ReactNode;
  /** Rendered at the very left of the row, before the icon — e.g. the placeholder's Dock control. */
  leading?: React.ReactNode;
  /** Rendered as a sibling BEFORE the expander/link control — must never nest inside it. */
  leadingControl?: React.ReactNode;
  /** Pan handlers making the row's click area (expander / title) a drag surface. */
  drag?: {
    onPanStart?: (e: unknown, info: { point: { x: number; y: number } }) => void;
    onPan?: (e: unknown, info: { point: { x: number; y: number } }) => void;
    onPanEnd?: (e: unknown, info: { point: { x: number; y: number } }) => void;
  };
  /** Merged over the shared row classes — e.g. `grow-0` for rows that must not stretch. */
  className?: string;
  /** Route target — renders the row as a link; omit for a toggle button. */
  to?: string;
  onClick?: () => void;
  /** Highlights the row: active route for links, open state for sections. */
  selected?: boolean;
  ariaExpanded?: boolean;
  /** Id of the region this row discloses. */
  ariaControls?: string;
}

export function SectionHeaderRow({
  icon,
  title,
  titleId,
  badge,
  actions,
  chevronSlot,
  leading,
  leadingControl,
  drag,
  className,
  to,
  onClick,
  selected,
  ariaExpanded,
  ariaControls,
}: SectionHeaderRowProps) {
  const left = (
    <>
      {leadingControl}
      {leading}
      {icon && <Icon icon={icon} size="xs" />}
      {badge && (
        <Badge color="teal" size="xs" className="font-bold">
          {badge}
        </Badge>
      )}
      <span id={titleId} className="truncate text-sm">
        {title}
      </span>
      {chevronSlot && (
        <span className="flex shrink-0 items-center justify-center">{chevronSlot}</span>
      )}
    </>
  );

  const control = to ? (
    <NavLink
      to={to}
      onClick={onClick}
      className={({ isActive }) =>
        twMerge(LEFT_CLASSES, (isActive || selected) && "text-foreground")
      }
    >
      {left}
    </NavLink>
  ) : onClick ? (
    <button
      data-expander
      type="button"
      aria-expanded={ariaExpanded}
      aria-controls={ariaControls}
      onClick={onClick}
      className={twMerge(LEFT_CLASSES, selected && "text-foreground")}
    >
      {left}
    </button>
  ) : (
    <div
      className={twMerge(
        LEFT_CLASSES,
        drag ? "cursor-grab active:cursor-grabbing" : "cursor-default",
        selected && "text-foreground",
      )}
    >
      {left}
    </div>
  );

  return (
    <div className={twMerge(ROW_CLASSES, className)}>
      {drag ? (
        // One stable pan surface spanning the control and the title area. The
        // inner control swaps button <-> div when a drag floats/docks the
        // section — remounting the pan element would kill the in-flight gesture.
        <motion.div
          className="flex grow touch-none"
          onPanStart={drag.onPanStart}
          onPan={drag.onPan}
          onPanEnd={drag.onPanEnd}
        >
          {control}
        </motion.div>
      ) : (
        <>{control}</>
      )}
      {actions && <div className="flex items-center gap-2 px-2">{actions}</div>}
    </div>
  );
}
