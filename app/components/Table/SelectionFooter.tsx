import { Button } from "@cytario/design";
import { ReactNode } from "react";

interface SelectionFooterProps {
  selectedCount: number;
  totalCount: number;
  onReset: () => void;
  children?: ReactNode;
}

export function SelectionFooter({
  selectedCount,
  totalCount,
  onReset,
  children,
}: SelectionFooterProps) {
  return (
    <div
      role="toolbar"
      aria-label={`Bulk actions for ${selectedCount} selected items`}
      className="sticky bottom-0 z-20 border-t border-(--color-border-strong) bg-white/95 backdrop-blur px-6 py-3"
    >
      <div className="container mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm text-(--color-text-secondary)">
            <span className="font-medium text-(--color-text-primary)">{selectedCount}</span> of{" "}
            {totalCount} selected
          </span>
          <Button variant="secondary" size="sm" onPress={onReset}>
            Clear selection
          </Button>
        </div>
        {children && <div className="flex items-center gap-2">{children}</div>}
      </div>
    </div>
  );
}
