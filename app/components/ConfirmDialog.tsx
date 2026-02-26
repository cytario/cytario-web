import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
} from "@headlessui/react";
import { type ReactNode } from "react";

import { Button } from "~/components/Controls";

interface ConfirmDialogProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  title: string;
  children: ReactNode;
  confirmLabel?: string;
  confirmTheme?: "error" | "primary";
}

export function ConfirmDialog({
  open,
  onConfirm,
  onCancel,
  title,
  children,
  confirmLabel = "Confirm",
  confirmTheme = "error",
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onClose={onCancel} className="relative z-50">
      <DialogBackdrop className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel className="w-full max-w-sm bg-white rounded-xl border border-slate-300 shadow-2xl text-slate-900">
          <header className="p-4 bg-slate-100 border-b border-slate-300 rounded-t-xl">
            <DialogTitle className="text-xl font-bold">{title}</DialogTitle>
          </header>
          <div className="p-4 space-y-2">{children}</div>
          <footer className="p-4 border-t border-slate-300 flex gap-3 justify-end">
            <Button onClick={onCancel} theme="white">
              Cancel
            </Button>
            <Button onClick={onConfirm} theme={confirmTheme}>
              {confirmLabel}
            </Button>
          </footer>
        </DialogPanel>
      </div>
    </Dialog>
  );
}
