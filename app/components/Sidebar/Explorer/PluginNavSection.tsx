import { usePluginNavEntries } from "./usePluginNavEntries";
import type { SidebarNavEntry } from "@cytario/plugin-api";
import { ClientOnly } from "~/components/ClientOnly";
import { SidebarNavItem } from "~/components/Sidebar/SidebarNavItem";
import { toastBridge } from "~/toast-bridge";

/**
 * Renders the plugin-contributed navigation section (§3.2.4 element 11,
 * §3.2.1.10) inside the Navigation/Explorer sidebar, after the connection
 * tree. Each entry is rendered through the host's own nav-link primitive
 * (`<SidebarNavItem>`, wrapping `react-router`'s `<NavLink>` — no
 * `dangerouslySetInnerHTML`, no raw HTML) so a plugin cannot inject markup
 * (SDS-CY-010916) and so active/inactive styling stays single-source. An
 * `onActivate` that throws or rejects is caught and surfaced as a contained
 * toast — the error shall not crash the sidebar.
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
      <nav aria-label="Plugin navigation" className="flex flex-col px-2 py-2">
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
    <SidebarNavItem to={entry.to} icon={entry.icon as never} onClick={handleActivate}>
      <span>{entry.label}</span>
    </SidebarNavItem>
  );
}
