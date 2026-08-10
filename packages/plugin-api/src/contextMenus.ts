import type { Identity } from "./auth";
import type { NavNavigate } from "./sidebarNav";

/**
 * Host-defined context-menu surfaces a plugin may contribute entries to.
 * v1 surface: `"s3-node"` — an image or folder row in the S3 Browser
 * (`app/components/DirectoryView/NodeLink/NodeContextMenu.tsx`).
 *
 * Additive: a future minor bump may add new literals; a plugin written
 * against v1 must not assume this union is closed at runtime. The host
 * ignores registrations targeting a `ContextMenuTarget` it does not know
 * about (logged at register time).
 */
export type ContextMenuTarget = "s3-node";

/**
 * Public node coordinates the S3 Browser already exposed to the user.
 * No secret, no role ARN, no bucket-policy document — a buggy or malicious
 * plugin cannot escalate beyond what the S3 Browser already reveals.
 */
export interface ContextMenuNode {
  connectionId: string;
  pathName: string;
  type: "bucket" | "directory" | "file";
}

/**
 * Activation context the host hands to `ContextMenuEntry.isHidden` and
 * `ContextMenuEntry.onActivate`. The `identity` is the PII-free
 * `Identity` of SDS-CY-010060/010061 — `organization?`,
 * `organizationAttributes`, `groups`, `adminScopes`, and **no other
 * field**. The host shall not pass name, email, `preferred_username`,
 * `sub`, tokens, or STS credentials to the activation context.
 */
export interface ContextMenuActivationContext {
  identity: Identity;
  target: ContextMenuTarget;
  node: ContextMenuNode;
  /**
   * Programmatic navigation, bound to the host's React Router instance.
   * A plugin's `onActivate` may call this to navigate to a computed
   * destination (e.g. open an analysis view for the selected node).
   * Mirrors `react-router`'s `useNavigate` surface.
   */
  navigate: NavNavigate;
}

/**
 * A single context-menu entry contributed by a plugin. Registrations are
 * **append-only and multi-owner** (precedent: `SlotRegistry`): multiple
 * plugins may target the same `ContextMenuTarget`, the host renders all
 * registered entries in registration order, and there is no replace or
 * unregister in v1.
 *
 * - `id` is plugin-unique; a duplicate `(target, id)` pair within a
 *   single plugin's registrations is a bootstrap-contained registration
 *   error. Cross-plugin `id` collisions are tolerated because the host
 *   qualifies the entry id with the plugin `name` internally.
 * - `label` and `icon` are untrusted string input at the host boundary;
 *   the host renders them through its own `<MenuItem>` primitive (no
 *   `dangerouslySetInnerHTML`, no raw HTML).
 * - `isHidden(ctx)` may be sync or async. The host treats a rejected or
 *   non-boolean `isHidden` as `true` (entry hidden) — the **fail-hidden**
 *   posture is deliberately asymmetric with the navigation gate's
 *   fail-open posture (SDS-CY-010072). An entry that omits `isHidden` is
 *   always visible, modulo the host's own gating.
 * - `onActivate(ctx)` may throw or reject; the host shall catch and
 *   surface the error as a contained toast, not crash the S3 Browser.
 */
export interface ContextMenuEntry {
  id: string;
  label: string;
  icon?: string;
  isHidden?(ctx: ContextMenuActivationContext): boolean | Promise<boolean>;
  onActivate(ctx: ContextMenuActivationContext): void;
}

/**
 * Registry contract. The registry *type* ships in `@cytario/plugin-api`;
 * the registry *implementation* and the rendering of menu items live in
 * the host (`app/components/contextMenuRegistry.ts`).
 *
 * Client-only: the host wires `ctx.contextMenus` into `PluginContext`
 * only when `ctx.env === "client"`; on the server entry the registry is
 * a no-op sink whose `register` is `() => {}`, so a single plugin module
 * can call `ctx.contextMenus.register(...)` unconditionally and the
 * call takes effect in the client realm only.
 */
export interface ContextMenuRegistry {
  register(target: ContextMenuTarget, entry: ContextMenuEntry): void;
}
