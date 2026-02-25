import { ReactNode } from "react";

import { Button } from "../Controls/Button/Button";

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
    <div className="sticky bottom-0 z-20 border-t border-slate-300 bg-white/95 backdrop-blur px-6 py-3">
      <div className="container mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-600">
            <span className="font-medium text-slate-900">{selectedCount}</span>
            {" "}of {totalCount} selected
          </span>
          <Button theme="white" scale="small" onClick={onReset}>
            Clear selection
          </Button>
        </div>
        {children && (
          <div className="flex items-center gap-2">{children}</div>
        )}
      </div>
    </div>
  );
}
