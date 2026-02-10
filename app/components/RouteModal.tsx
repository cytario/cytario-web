import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
} from "@headlessui/react";
import { ReactNode, useCallback } from "react";
import { useNavigate } from "react-router";

import { IconButton } from "./Controls";

export function RouteModal({
  title,
  children,
  onClose,
}: Readonly<{
  title: string;
  children: ReactNode;
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
            w-full max-w-lg bg-white rounded-xl border-slate-300 shadow-2xl
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
        </DialogPanel>
      </div>
    </Dialog>
  );
}
