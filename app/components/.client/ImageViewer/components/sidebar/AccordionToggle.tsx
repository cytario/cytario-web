import { IconButton } from "@cytario/design";
import { twMerge } from "tailwind-merge";

/** Right-pointing chevron that collapses/expands an accordion row. */
export function AccordionToggle({
  name,
  isOpen,
  onToggle,
}: {
  name: string;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <IconButton
      icon="ChevronRight"
      label={isOpen ? `Collapse ${name}` : `Expand ${name}`}
      variant="ghost"
      size="xs"
      onPress={onToggle}
      className={twMerge(
        "shrink-0 -mr-2 transition-transform text-muted-foreground",
        isOpen && "rotate-90",
        isOpen && "text-foreground",
      )}
    />
  );
}
