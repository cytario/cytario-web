import { useSyncExternalStore } from "react";

const emptySubscribe = () => () => {};

export const ClientOnly = ({
  children,
  fallback = null,
}: {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) => {
  const isClient = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

  if (!isClient) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
};
