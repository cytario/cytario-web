import { useContextMenu } from "@cytario/design";

import { AnnotationMenuItems, type AnnotationMenuItemsProps } from "./AnnotationMenuItems";

interface UseAnnotationContextMenuProps extends AnnotationMenuItemsProps {
  /** Accessible name of the menu (also the kebab button's action context). */
  label: string;
}

/** Cursor-anchored context menu for one annotation, rendering the shared
 *  {@link AnnotationMenuItems} body. Spread `targetProps` on the right-clickable
 *  element and `triggerProps` on a keyboard/click trigger. */
export const useAnnotationContextMenu = ({ label, ...items }: UseAnnotationContextMenuProps) =>
  useContextMenu({
    label,
    content: <AnnotationMenuItems {...items} />,
  });
