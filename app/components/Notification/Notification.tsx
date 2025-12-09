import { useEffect } from "react";
import { createPortal } from "react-dom";
import { twMerge } from "tailwind-merge";

import { useNotificationStore } from "./Notification.store";
import { IconButton } from "../Controls/IconButton";
import { InputGroup } from "../Controls/InputGroup";

export type NotificationType = "success" | "error" | "info";

export interface NotificationInput {
  message: string;
  status?: NotificationType;
  duration?: number;
}

export interface Notification extends NotificationInput {
  id: string;
}

const FIVE_SECONDS = 5 * 1000; // 5 seconds
const TEN_SECONDS = 10 * 1000; // 10 seconds

const getDefaultDuration = (status?: NotificationType) => {
  switch (status) {
    case "error":
      // return Infinity;
      return TEN_SECONDS;
    case "success":
    case "info":
    default:
      return FIVE_SECONDS;
  }
};

const colors = {
  success: "border-green-500/80",
  error: "border-rose-700/80",
  info: "border-slate-700/80",
};

const style = `
  pointer-events-auto
  rounded-sm shadow-lg 
  backdrop-blur-sm
  
`;

const NotificationItem = ({
  id,
  message,
  status = "info",
  removeNotification,
}: {
  id: number;
  message: string;
  status?: NotificationType;
  removeNotification: (id: number) => void;
}) => {
  const cx = twMerge(
    "px-2 py-1 bg-white/80 text-slate-900 border",
    colors[status]
  );

  return (
    <InputGroup role="alert" className={style}>
      <span className={cx}>{message}</span>
      <IconButton
        icon="X"
        onClick={() => removeNotification(id)}
        theme={status}
      />
    </InputGroup>
  );
};

export function NotificationList() {
  const { notifications, removeNotification } = useNotificationStore();

  useEffect(() => {
    notifications.forEach(
      ({ id, status, duration = getDefaultDuration(status) }) => {
        // No timeout for infinite duration
        // Notification must be dismissed manually
        if (duration === Infinity) return;
        const timer = setTimeout(() => removeNotification(id), duration);
        return () => clearTimeout(timer);
      }
    );
  }, [notifications, removeNotification]);

  const notificationMarkup = (
    // Fixed notifications container
    <div className="z-50 fixed top-8 left-0 right-0 mx-auto flex flex-col items-center px-2 gap-1  pointer-events-none">
      {notifications.map(({ id, message, status }) => (
        <NotificationItem
          key={id}
          id={id}
          message={message}
          status={status}
          removeNotification={removeNotification}
        />
      ))}
    </div>
  );

  if (typeof document === "undefined") {
    // SSR: render container directly so markup matches
    return notificationMarkup;
  }

  // Client: use portal
  return createPortal(
    notificationMarkup,
    document.getElementById("notification")!
  );
}
