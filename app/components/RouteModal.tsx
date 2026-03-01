import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
} from "@headlessui/react";
import { type ReactNode, useCallback } from "react";
import { useNavigate } from "react-router";

import { IconButton } from "./Controls";

const sizeClasses = {
  default: "max-w-lg",
  wide: "max-w-2xl",
} as const;

export function RouteModal({
  title,
  children,
  footer,
  size = "default",
  onClose,
}: Readonly<{
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: keyof typeof sizeClasses;
  onClose?: () => void;
}>) {
  const navigate = useNavigate();
  const goBack = useCallback(() => navigate(-1), [navigate]);
  const action = onClose ?? goBack;

  return (
    <Dialog open={true} onClose={action} className="relative z-40">
      <DialogBackdrop className="fixed inset-0 bg-black/50 backdrop-blur-sm" />

      <div className="fixed inset-0 flex items-center justify-center p-4 overflow-auto ">
        <DialogPanel
          className={`
            w-full ${sizeClasses[size]} bg-white rounded-xl border-slate-300 shadow-2xl
            max-h-full flex flex-col
            overflow-hidden border text-slate-900
          `}
        >
          <header
            className={`
              flex items-start justify-between
              p-4 bg-slate-100
              border-b border-slate-300
              rounded-t-xl
              flex-shrink-0
            `}
          >
            <DialogTitle className="text-xl font-bold">{title}</DialogTitle>
            <IconButton
              onClick={action}
              icon="X"
              label="Close modal"
              theme="transparent"
            />
          </header>
          <div className="space-y-8 p-4 overflow-y-auto flex-1">{children}</div>
          {footer && (
            <footer className="p-4 border-t border-slate-300 flex-shrink-0 flex gap-3 justify-end">
              {footer}
            </footer>
          )}
        </DialogPanel>
      </div>
    </Dialog>
  );
}
