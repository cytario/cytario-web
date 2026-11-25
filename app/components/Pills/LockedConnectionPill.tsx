import { Badge, Tooltip } from "@cytario/design";

/** The one copy the host shows for a gate-locked connection: the reason lives
 *  in the plugin, so the host states only what the user can do about it. */
export const LOCKED_CONNECTION_NOTE = "Upgrade plan to browse";

/** Marks a connection the plugin gate listed but does not let be browsed. */
export function LockedConnectionPill() {
  return (
    <Tooltip content={LOCKED_CONNECTION_NOTE}>
      <Badge color="slate" size="xs" aria-label={LOCKED_CONNECTION_NOTE}>
        Locked
      </Badge>
    </Tooltip>
  );
}
