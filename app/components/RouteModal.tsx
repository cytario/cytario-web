import { Dialog } from "@cytario/design";
import { ReactNode, useCallback } from "react";
import { useNavigate } from "react-router";

export function RouteModal({
  title,
  children,
  size,
  onClose,
}: Readonly<{
  title: string;
  children: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  onClose?: () => void;
}>) {
  const navigate = useNavigate();
  const goBack = useCallback(() => navigate(-1), [navigate]);
  const handleClose = onClose ?? goBack;

  return (
    <Dialog
      isOpen={true}
      onOpenChange={(isOpen) => {
        if (!isOpen) handleClose();
      }}
      title={title}
      size={size}
    >
      {children}
    </Dialog>
  );
}
