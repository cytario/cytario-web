export type NotificationType = "success" | "error" | "info";

export interface NotificationInput {
  message: string;
  status?: NotificationType;
  duration?: number;
}
