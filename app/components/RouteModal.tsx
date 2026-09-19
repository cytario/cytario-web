import { Dialog } from "@cytario/design";
import { ReactNode, useCallback } from "react";
import { useNavigate } from "react-router";

export function RouteModal({
  title,
  children,
  size = "md",
  isDismissable = true,
  onClose,
}: Readonly<{
  title: string;
  children: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  /** Backdrop-click dismiss only; Escape always closes regardless. */
  isDismissable?: boolean;
  onClose?: () => void;
}>) {
  const navigate = useNavigate();
  const goBack = useCallback(() => navigate(-1), [navigate]);
  const handleClose = onClose ?? goBack;

  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      if (!isOpen) handleClose();
    },
    [handleClose],
  );

  return (
    <Dialog
      isOpen={true}
      onOpenChange={handleOpenChange}
      title={title}
      size={size}
      isDismissable={isDismissable}
    >
      {children}
    </Dialog>
  );
}
