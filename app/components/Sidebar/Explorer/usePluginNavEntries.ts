import { useEffect, useState } from "react";
import { useNavigate, useRouteLoaderData } from "react-router";

import type {
  Identity,
  NavNavigate,
  SidebarNavActivationContext,
  SidebarNavEntry,
} from "@cytario/plugin-api";
import { sidebarNavRegistry } from "~/components/sidebarNavRegistry";
import type { loader as protectedLayoutLoader } from "~/routes/layouts/protected.layout";

/**
 * Resolves plugin-contributed sidebar-navigation entries, applying each
 * entry's `isHidden` gate (fail-hidden, SDS-CY-010915).
 *
 * Returns the entries the host should render, in registration order, with
 * the activation context the host will hand to `onActivate`. Re-runs
 * `isHidden` when the identity changes.
 */
export interface VisiblePluginNavEntry {
  entry: SidebarNavEntry;
  activationContext: SidebarNavActivationContext;
}

export function usePluginNavEntries(): VisiblePluginNavEntry[] {
  const layoutData = useRouteLoaderData<typeof protectedLayoutLoader>(
    "routes/layouts/protected.layout",
  );
  const identity = layoutData?.identity as Identity | undefined;
  const navigate = useNavigate();

  const [visible, setVisible] = useState<VisiblePluginNavEntry[]>([]);

  useEffect(() => {
    const records = sidebarNavRegistry.get("nav");
    if (records.length === 0 || !identity) {
      // Synchronous clear: no plugin entries are eligible, so the previous
      // render's visible set (if any) must be dropped before the next paint
      // to avoid a stale "Jobs" item flashing on an identity change.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setVisible([]);
      return;
    }

    let cancelled = false;
    void Promise.all(
      records.map(async ({ entry }) => {
        const activationContext: SidebarNavActivationContext = {
          identity,
          target: "nav",
          navigate: navigate as NavNavigate,
        };
        if (!entry.isHidden) return { entry, activationContext };
        try {
          const hidden = await entry.isHidden(activationContext);
          return typeof hidden === "boolean" && hidden === false
            ? { entry, activationContext }
            : null;
        } catch (err) {
          // Fail-hidden (SDS-CY-010915): a rejected or throwing isHidden hides
          // the entry rather than surfacing a broken nav item that could lock
          // the user out of the sidebar.
          console.error(
            `[sidebarNavRegistry] plugin entry "${entry.id}" isHidden rejected; hiding`,
            err,
          );
          return null;
        }
      }),
    )
      .then((results) => {
        if (cancelled) return;
        setVisible(results.filter((r): r is VisiblePluginNavEntry => r !== null));
      })
      .catch((err) => {
        // Defensive — Promise.all rejects only on a throw outside the map body.
        console.error("[sidebarNavRegistry] visibility resolution failed", err);
        if (!cancelled) setVisible([]);
      });

    return () => {
      cancelled = true;
    };
  }, [identity, navigate]);

  return visible;
}
