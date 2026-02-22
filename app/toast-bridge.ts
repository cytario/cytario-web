import { createToastBridge, type ToastVariant } from "@cytario/design";

export const toastBridge = createToastBridge();

/** Map backend notification status (which includes "warning") to ToastVariant. */
export const toToastVariant = (status: string): ToastVariant =>
  status === "warning" ? "info" : (status as ToastVariant);
