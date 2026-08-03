import type { SidebarNavEntry, SidebarNavRegistry, SidebarNavTarget } from "@cytario/plugin-api";

interface SidebarNavRecord {
  pluginName: string;
  entry: SidebarNavEntry;
}

/**
 * Client sidebar-nav registry: multi-owner module singleton.
 * `scopedFor(pluginName)` binds the plugin name at register time (mirrors
 * `contextMenuRegistry` / `slotRegistry`); `register` appends (no collision
 * detection across plugins); `get` returns entries in registration order. A
 * duplicate `(target, id)` pair within a single plugin's registrations
 * throws (SDS-CY-010912); cross-plugin `id` collisions are tolerated because
 * the host qualifies the entry id with the plugin `name` internally.
 *
 * Client-only: the bootstrap injects this registry only when
 * `ctx.env === "client"` (SDS-CY-010913); the server entry receives a no-op
 * sink.
 */
class SidebarNavRegistryImpl {
  private readonly byTarget: Record<SidebarNavTarget, SidebarNavRecord[]> = {
    nav: [],
  };

  /** Host-internal: a `SidebarNavRegistry` adapter bound to a plugin name. */
  scopedFor(pluginName: string): SidebarNavRegistry {
    return {
      register: (target, entry) => this.add(pluginName, target, entry),
    };
  }

  add(pluginName: string, target: SidebarNavTarget, entry: SidebarNavEntry): void {
    if (!entry || typeof entry !== "object") {
      throw new TypeError(
        `Plugin "${pluginName}" registered a non-object for sidebar-nav target "${target}"`,
      );
    }
    if (typeof entry.id !== "string" || entry.id.length === 0) {
      throw new TypeError(
        `Plugin "${pluginName}" registered a sidebar-nav entry with a missing or empty id`,
      );
    }
    if (typeof entry.label !== "string" || entry.label.length === 0) {
      throw new TypeError(
        `Plugin "${pluginName}" registered a sidebar-nav entry with a missing or empty label`,
      );
    }
    if (typeof entry.to !== "string" || entry.to.length === 0) {
      throw new TypeError(
        `Plugin "${pluginName}" registered a sidebar-nav entry "${entry.id}" with a missing or empty to`,
      );
    }
    if (entry.isHidden !== undefined && typeof entry.isHidden !== "function") {
      throw new TypeError(
        `Plugin "${pluginName}" registered a sidebar-nav entry "${entry.id}" with a non-function isHidden`,
      );
    }
    if (entry.onActivate !== undefined && typeof entry.onActivate !== "function") {
      throw new TypeError(
        `Plugin "${pluginName}" registered a sidebar-nav entry "${entry.id}" with a non-function onActivate`,
      );
    }
    if (!this.byTarget[target]) {
      // Unknown target: host ignores but logs (forward-compat with future minor
      // bumps that add new literals; a plugin written against v1 may target a
      // newer surface and the host predates it — fail to register, do not
      // crash bootstrap).
      console.warn(
        `[sidebarNavRegistry] plugin "${pluginName}" targeted unknown sidebar-nav target "${target}"; ignoring entry "${entry.id}"`,
      );
      return;
    }
    const dup = this.byTarget[target].find(
      (r) => r.pluginName === pluginName && r.entry.id === entry.id,
    );
    if (dup) {
      throw new Error(
        `Plugin "${pluginName}" registered a duplicate sidebar-nav entry id "${entry.id}" for target "${target}"`,
      );
    }
    this.byTarget[target].push({ pluginName, entry });
  }

  get(target: SidebarNavTarget): SidebarNavRecord[] {
    return this.byTarget[target] ? [...this.byTarget[target]] : [];
  }

  /** Test-only: drop all registrations. */
  __reset(): void {
    for (const target of Object.keys(this.byTarget) as SidebarNavTarget[]) {
      this.byTarget[target].length = 0;
    }
  }
}

export const sidebarNavRegistry = new SidebarNavRegistryImpl();

export type { SidebarNavRegistryImpl };
