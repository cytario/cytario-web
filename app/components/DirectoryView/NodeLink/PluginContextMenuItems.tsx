import { MenuItem, MenuSeparator } from "@cytario/design";

import { usePluginContextMenuEntries } from "./usePluginContextMenuEntries";
import type { ContextMenuEntry } from "@cytario/plugin-api";
import type { TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { toastBridge } from "~/toast-bridge";

/**
 * Renders plugin-contributed `s3-node` context-menu entries inside the host
 * `NodeContextMenu`, after the host's own items and any caller-supplied
 * `extraItems`. Each entry is rendered through the same `<MenuItem>`
 * primitive the host's own menu items use (no `dangerouslySetInnerHTML`,
 * no raw HTML) so a plugin cannot inject markup (SDS-CY-010910). An
 * `onActivate` that throws or rejects is caught and surfaced as a
 * contained toast — the error shall not crash the S3 Browser.
 *
 * Renders a leading `<MenuSeparator>` only when at least one plugin entry
 * is visible, so the menu has no trailing separator when no plugin is
 * loaded or every plugin's `isHidden` returned true.
 */
export function PluginContextMenuItems({ node }: { node: TreeNode }) {
  const visible = usePluginContextMenuEntries(node);

  if (visible.length === 0) return null;

  const handleActivate = (
    entry: ContextMenuEntry,
    activationContext: Parameters<ContextMenuEntry["onActivate"]>[0],
  ) => {
    let result: unknown;
    try {
      result = entry.onActivate(activationContext);
    } catch (err) {
      console.error(`[contextMenuRegistry] plugin entry "${entry.id}" onActivate threw`, err);
      toastBridge.emit({
        variant: "error",
        message: `Plugin action "${entry.label}" failed`,
      });
      return;
    }
    if (result && typeof (result as Promise<unknown>).then === "function") {
      (result as Promise<unknown>).catch((err) => {
        console.error(`[contextMenuRegistry] plugin entry "${entry.id}" onActivate rejected`, err);
        toastBridge.emit({
          variant: "error",
          message: `Plugin action "${entry.label}" failed`,
        });
      });
    }
  };

  return (
    <>
      <MenuSeparator />
      {visible.map(({ entry, activationContext }) => (
        <MenuItem
          key={`plugin:${entry.id}`}
          id={`plugin-${entry.id}`}
          icon={entry.icon as never}
          onAction={() => handleActivate(entry, activationContext)}
        >
          {entry.label}
        </MenuItem>
      ))}
    </>
  );
}
