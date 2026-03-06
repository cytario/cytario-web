import { Button, Dialog } from "@cytario/design";
import { type ReactNode } from "react";

interface ConfirmDialogProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  title: string;
  children: ReactNode;
  confirmLabel?: string;
  confirmVariant?: "destructive" | "primary";
}

export function ConfirmDialog({
  open,
  onConfirm,
  onCancel,
  title,
  children,
  confirmLabel = "Confirm",
  confirmVariant = "destructive",
}: ConfirmDialogProps) {
  return (
    <Dialog
      isOpen={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onCancel();
      }}
      title={title}
      size="sm"
    >
      <div className="space-y-2">{children}</div>
      <div className="flex gap-3 justify-end mt-4">
        <Button onPress={onCancel} variant="secondary">
          Cancel
        </Button>
        <Button onPress={onConfirm} variant={confirmVariant}>
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
