import { Icon, type IconValue } from "@cytario/design";
import { NavLink, type NavLinkProps } from "react-router";
import { twMerge } from "tailwind-merge";

/** `isActive` only applies to in-app routes — an external `to` is always inactive. */
export function sidebarNavItemClasses({ isActive }: { isActive: boolean }): string {
  return isActive
    ? "bg-accent text-accent-foreground"
    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground";
}

const ROW_CLASSES = "flex items-center gap-2 px-2 h-9 rounded-md text-sm transition-colors";

export interface SidebarNavItemProps extends Omit<NavLinkProps, "className" | "to"> {
  to: NavLinkProps["to"];
  icon?: IconValue;
  className?: string;
  children?: React.ReactNode;
}

export function SidebarNavItem({ to, icon, className, children, ...rest }: SidebarNavItemProps) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        twMerge(ROW_CLASSES, sidebarNavItemClasses({ isActive }), className)
      }
      {...rest}
    >
      {icon && <Icon icon={icon} size="sm" />}
      {children}
    </NavLink>
  );
}
