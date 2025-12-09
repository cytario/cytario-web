import { useEffect } from "react";
import { useActionData, useLoaderData } from "react-router";
import { create } from "zustand";

export type NotificationType = "success" | "error" | "info";

export interface NotificationInput {
  message: string;
  status?: NotificationType;
  duration?: number;
}

export interface Notification extends NotificationInput {
  id: number;
}

interface NotificationStore {
  notifications: Notification[];
  addNotification: (n: NotificationInput) => number;
  removeNotification: (id: number) => void;
}

let notificationId = 0;

export const useNotificationStore = create<NotificationStore>((set) => ({
  notifications: [],
  addNotification: (n) => {
    const id = notificationId++;
    set((state) => ({
      notifications: [...state.notifications, { ...n, id }],
    }));
    return id;
  },
  removeNotification: (id) => {
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    }));
  },
}));

/**
 * Custom hook to handle backend notifications.
 * @returns The notification data if available.
 */
export const useBackendNotification = (): void => {
  const actionData = useActionData<NotificationInput>();
  const loaderData = useLoaderData<{ notification?: NotificationInput }>();
  const notification = actionData || loaderData?.notification;

  useEffect(() => {
    if (notification) {
      useNotificationStore.getState().addNotification(notification);
    }
  }, [notification]);

  return;
};
