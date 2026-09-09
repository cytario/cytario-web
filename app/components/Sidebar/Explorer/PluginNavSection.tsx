import type { IconValue } from "@cytario/design";

import { usePluginNavEntries } from "./usePluginNavEntries";
import type { SidebarNavEntry } from "@cytario/plugin-api";
import { ClientOnly } from "~/components/ClientOnly";
import { SectionHeaderRow } from "~/components/Section/SectionHeaderRow";
import { toastBridge } from "~/toast-bridge";

/**
 * Renders the plugin-contributed navigation section (§3.2.4 element 11,
 * §3.2.1.10) inside the Navigation/Explorer sidebar, after the connection
 * tree. Each entry renders as a `SectionHeaderRow` link — the same header
 * chrome, height, and icon/title alignment as the accordion sections, with
 * an empty disclosure slot (entries navigate, they don't expand) — so a
 * plugin cannot inject markup (SDS-CY-010916) and active/inactive styling
 * stays single-source. An `onActivate` that throws or rejects is caught and
 * surfaced as a contained toast — the error shall not crash the sidebar.
 *
 * Renders nothing (no reserved space, no placeholder) when the registry
 * is empty — precedent SRS-CY-37101 for slots. Rendered only after
 * client-side hydration via `<ClientOnly>` (SDS-CY-010916) so plugin nav
 * entries do not enter the SSR HTML and do not regress the host's CSP.
 */
export function PluginNavSection() {
  const visible = usePluginNavEntries();

  if (visible.length === 0) return null;

  return (
    <ClientOnly>
      <nav aria-label="Plugin navigation" className="flex flex-col">
        {visible.map(({ entry, activationContext }) => (
          <PluginNavEntry
            key={`plugin:${entry.id}`}
            entry={entry}
            activationContext={activationContext}
          />
        ))}
      </nav>
    </ClientOnly>
  );
}

function PluginNavEntry({
  entry,
  activationContext,
}: {
  entry: SidebarNavEntry;
  activationContext: Parameters<NonNullable<SidebarNavEntry["onActivate"]>>[0];
}) {
  const handleActivate = () => {
    if (!entry.onActivate) return;
    let result: unknown;
    try {
      result = entry.onActivate(activationContext);
    } catch (err) {
      console.error(`[sidebarNavRegistry] plugin entry "${entry.id}" onActivate threw`, err);
      toastBridge.emit({
        variant: "error",
        message: `Plugin action "${entry.label}" failed`,
      });
      return;
    }
    if (result && typeof (result as Promise<unknown>).then === "function") {
      (result as Promise<unknown>).catch((err) => {
        console.error(`[sidebarNavRegistry] plugin entry "${entry.id}" onActivate rejected`, err);
        toastBridge.emit({
          variant: "error",
          message: `Plugin action "${entry.label}" failed`,
        });
      });
    }
  };

  return (
    <SectionHeaderRow
      to={entry.to}
      // The plugin API types icons as plain string; Icon renders a fallback
      // for unknown names, so the cast only crosses that boundary.
      icon={entry.icon as IconValue}
      title={entry.label}
      onClick={handleActivate}
    />
  );
}
