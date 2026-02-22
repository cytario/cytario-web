import { useEffect } from "react";
import { useActionData, useLoaderData } from "react-router";

import { toastBridge, toToastVariant } from "~/toast-bridge";

export type NotificationType = "success" | "error" | "warning" | "info";

export interface NotificationInput {
  message: string;
  status?: NotificationType;
  duration?: number;
}

/**
 * Custom hook to handle backend notifications via the toast bridge.
 * Converts loader/action notification data into toast messages.
 */
export const useBackendNotification = (): void => {
  const actionData = useActionData<NotificationInput>();
  const loaderData = useLoaderData<{ notification?: NotificationInput }>();
  const notification = actionData || loaderData?.notification;

  useEffect(() => {
    if (notification) {
      toastBridge.emit({
        variant: toToastVariant(notification.status ?? "info"),
        message: notification.message,
      });
    }
  }, [notification]);
};
