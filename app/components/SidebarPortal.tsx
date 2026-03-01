import { createContext, ReactNode, useContext } from "react";
import { createPortal } from "react-dom";

/**
 * Context that holds the DOM element where sidebar content gets portaled into.
 * Provided by ScrollViewLayout, consumed by routes via <SidebarPortal>.
 */
const SidebarPortalContext = createContext<HTMLDivElement | null>(null);

export const SidebarPortalProvider = SidebarPortalContext.Provider;

/** Renders children into the layout-level sidebar slot via a React portal. */
export function SidebarPortal({ children }: { children: ReactNode }) {
  const target = useContext(SidebarPortalContext);
  if (!target) return null;
  return createPortal(children, target);
}
