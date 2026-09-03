import { Tooltip } from "@cytario/design";
import { twMerge } from "tailwind-merge";

import { select } from "~/utils/connectionsStore/selectors";
import { useConnectionsStore } from "~/utils/connectionsStore/useConnectionsStore";

interface ConnectionStatusIndicatorProps {
  connectionId: string;
}

const VARIANTS = {
  connected: { className: "bg-secondary", label: "Connected" },
  error: { className: "bg-destructive", label: "Connection error" },
  loading: { className: "bg-warning animate-pulse", label: "Connecting…" },
} as const;

/**
 * Connection health indicator. Subscribes to the connections store itself so
 * every surface that renders a bucket node (list, sidebar, search) shows the
 * same live status, and any component with a connectionId can drop it in.
 */
export function ConnectionStatusIndicator({ connectionId }: ConnectionStatusIndicatorProps) {
  const status = useConnectionsStore(select.connectionStatus(connectionId));
  const statusMessage = useConnectionsStore(select.connectionStatusMessage(connectionId));

  const { className, label } = VARIANTS[status];
  const fullLabel = statusMessage ?? label;

  const cx = twMerge(`inline-block shrink-0 w-2.5 h-2.5 rounded-full transition-colors`, className);

  return (
    <Tooltip content={fullLabel}>
      <span role="img" aria-label={fullLabel} className={cx} />
    </Tooltip>
  );
}
