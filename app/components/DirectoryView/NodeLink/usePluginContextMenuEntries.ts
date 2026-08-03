import { useEffect, useState } from "react";
import { useNavigate, useRouteLoaderData } from "react-router";

import type {
  ContextMenuActivationContext,
  ContextMenuEntry,
  ContextMenuNode,
  Identity,
  NavNavigate,
} from "@cytario/plugin-api";
import { contextMenuRegistry } from "~/components/contextMenuRegistry";
import type { TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import type { loader as protectedLayoutLoader } from "~/routes/layouts/protected.layout";

/**
 * Resolves plugin-contributed context-menu entries for an S3 node, applying
 * each entry's `isHidden` gate (fail-hidden, SDS-CY-010908).
 *
 * Returns the entries the host should render for the given node, in
 * registration order, with the activation context the host will hand to
 * `onActivate`. Re-runs `isHidden` when the node identity changes.
 */
export interface VisiblePluginEntry {
  entry: ContextMenuEntry;
  activationContext: ContextMenuActivationContext;
}

export function usePluginContextMenuEntries(node: TreeNode): VisiblePluginEntry[] {
  const layoutData = useRouteLoaderData<typeof protectedLayoutLoader>(
    "routes/layouts/protected.layout",
  );
  const identity = layoutData?.identity as Identity | undefined;
  const navigate = useNavigate();

  const [visible, setVisible] = useState<VisiblePluginEntry[]>([]);

  useEffect(() => {
    const records = contextMenuRegistry.get("s3-node");
    if (records.length === 0 || !identity) {
      // Synchronous clear: no plugin entries are eligible for this node, so
      // the previous render's visible set (if any) must be dropped before the
      // next paint to avoid a stale "Analyze" item flashing on a node change.
      // The cascading-render concern of react-hooks/set-state-in-effect does
      // not apply here: the clear is the *only* setState in this branch and the
      // alternative (deferring to a microtask) would visibly flash stale
      // entries between renders.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setVisible([]);
      return;
    }

    const activationNode: ContextMenuNode = {
      connectionId: node.connectionId,
      pathName: node.pathName,
      type: node.type,
    };

    let cancelled = false;
    void Promise.all(
      records.map(async ({ entry }) => {
        const activationContext: ContextMenuActivationContext = {
          identity,
          target: "s3-node",
          node: activationNode,
          navigate: navigate as NavNavigate,
        };
        if (!entry.isHidden) return { entry, activationContext };
        try {
          const hidden = await entry.isHidden(activationContext);
          return typeof hidden === "boolean" && hidden === false
            ? { entry, activationContext }
            : null;
        } catch (err) {
          // Fail-hidden (SDS-CY-010908): a rejected or throwing isHidden hides
          // the entry rather than surfacing a broken "Analyze" item that
          // could lock the user out of the S3 Browser.
          console.error(
            `[contextMenuRegistry] plugin entry "${entry.id}" isHidden rejected; hiding`,
            err,
          );
          return null;
        }
      }),
    )
      .then((results) => {
        if (cancelled) return;
        setVisible(results.filter((r): r is VisiblePluginEntry => r !== null));
      })
      .catch((err) => {
        // Defensive — Promise.all rejects only on a throw outside the map body.
        console.error("[contextMenuRegistry] visibility resolution failed", err);
        if (!cancelled) setVisible([]);
      });

    return () => {
      cancelled = true;
    };
  }, [identity, navigate, node.connectionId, node.pathName, node.type]);

  return visible;
}
