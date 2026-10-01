import { type ToastVariant } from "@cytario/design";

export type NotificationType = "success" | "error" | "warning" | "info";

export interface NotificationInput {
  message: string;
  status?: NotificationType;
  duration?: number;
}

/** Map backend notification status (which includes "warning") to ToastVariant. */
export const toToastVariant = (status: string): ToastVariant =>
  status === "warning" ? "info" : (status as ToastVariant);
