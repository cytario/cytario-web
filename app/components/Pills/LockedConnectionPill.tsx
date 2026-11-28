import { Badge, Link, Tooltip } from "@cytario/design";

import type { LockedConnection } from "~/utils/lockedConnection";

/** The fallback copy when a gate locks a connection without saying why — the
 *  reason lives in the plugin, so the host states only what to do about it. */
export const LOCKED_CONNECTION_NOTE = "Upgrade plan to browse";

/** Marks a connection the plugin gate listed but does not let be browsed.
 *  A lock outcome that carries a call to action renders it as the row's link;
 *  without one the badge states the reason on its own. */
export function LockedConnectionPill({ locked }: { locked?: LockedConnection }) {
  const note = locked?.message ?? LOCKED_CONNECTION_NOTE;

  if (locked?.resolveUrl) {
    return (
      <span className="flex items-center gap-1">
        <Tooltip content={note}>
          <Badge color="slate" size="xs" aria-label={note}>
            Locked
          </Badge>
        </Tooltip>
        <Link href={locked.resolveUrl} variant="subtle" className="text-xs whitespace-nowrap">
          {locked.resolveLabel ?? "Upgrade"}
        </Link>
      </span>
    );
  }

  return (
    <Tooltip content={note}>
      <Badge color="slate" size="xs" aria-label={note}>
        Locked
      </Badge>
    </Tooltip>
  );
}
