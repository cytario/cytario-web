import type { Identity } from "./auth";

/**
 * Host-defined navigation surfaces a plugin may contribute entries to.
 * v1 surface: `"nav"` — the Navigation/Explorer sidebar's plugin-navigation
 * section (`app/components/Sidebar/Explorer/PluginNavSection.tsx`,
 * §3.2.4 element 11).
 *
 * Additive: a future minor bump may add new literals; a plugin written
 * against v1 must not assume this union is closed at runtime. The host
 * ignores registrations targeting a `SidebarNavTarget` it does not know
 * about (logged at register time).
 */
export type SidebarNavTarget = "nav";

/**
 * A navigation function the host binds to React Router's `useNavigate`,
 * giving a plugin's `onActivate` / `isHidden` the ability to navigate
 * programmatically (conditional routes, dynamic params, button-like
 * entries with no static `to`). Mirrors `react-router`'s `NavigateFunction`
 * surface but typed as a structural minimal shape so the plugin-api package
 * does not depend on `react-router`. The host shall not pass `undefined`
 * here — the function is always bound on the client. On the server entry it
 * is a no-op (the sidebar is client-only, SDS-CY-010916).
 */
export interface NavNavigate {
  (to: string, opts?: { replace?: boolean }): void;
  (delta: number): void;
}

/**
 * Activation context the host hands to `SidebarNavEntry.isHidden` and
 * `SidebarNavEntry.onActivate`. The `identity` is the PII-free
 * `Identity` of SDS-CY-010060/010061 — `organization?`,
 * `organizationAttributes`, `groups`, `adminScopes`, and **no other
 * field**. The host shall not pass name, email, `preferred_username`,
 * `sub`, tokens, or STS credentials to the activation context. Unlike
 * the context-menu activation context (SDS-CY-010907), a nav entry
 * carries no `node` — navigation entries are not tied to a selected S3
 * node.
 */
export interface SidebarNavActivationContext {
  identity: Identity;
  target: SidebarNavTarget;
  /**
   * Programmatic navigation, bound to the host's React Router instance.
   * A plugin's `onActivate` may call this to navigate to a computed
   * destination, overriding or supplementing the static `to` link.
   * Mirrors `react-router`'s `useNavigate` surface.
   */
  navigate: NavNavigate;
}

/**
 * A single sidebar-navigation entry contributed by a plugin.
 * Registrations are **append-only and multi-owner** (precedent
 * `SlotRegistry`, SDS-CY-010080): multiple plugins may target the same
 * `SidebarNavTarget`, the host renders all registered entries in
 * registration order, and there is no replace or unregister in v1.
 *
 * - `id` is plugin-unique; a duplicate `(target, id)` pair within a
 *   single plugin's registrations is a bootstrap-contained registration
 *   error (SDS-CY-010092). Cross-plugin `id` collisions are tolerated
 *   because the host qualifies the entry id with the plugin `name`
 *   internally.
 * - `label`, `icon`, and `id` are untrusted string input at the host
 *   boundary; the host renders them through its own nav-link primitive
 *   (no `dangerouslySetInnerHTML`, no raw HTML, no template-string
 *   interpolation into JSX).
 * - `to` is a route path the host's nav-link primitive resolves; the
 *   host treats it as untrusted input and renders it through the same
 *   `<Link>`/`<a>` primitive the host's own sidebar entries use, so a
 *   plugin cannot inject markup or a `javascript:` URL.
 * - `isHidden(ctx)` may be sync or async. The host treats a rejected
 *   or non-boolean `isHidden` as `true` (entry hidden) — the
 *   **fail-hidden** posture is deliberately asymmetric with the
 *   navigation gate's fail-open posture (SDS-CY-010072,
 *   SDS-CY-010915). An entry that omits `isHidden` is always visible,
 *   modulo the host's own gating.
 * - `onActivate(ctx)` is optional (the `to` route navigation is the
 *   primary affordance) and may throw or reject; the host shall catch
 *   and surface the error as a contained toast, not crash the sidebar.
 */
export interface SidebarNavEntry {
  id: string;
  label: string;
  icon?: string;
  to: string;
  isHidden?(ctx: SidebarNavActivationContext): boolean | Promise<boolean>;
  onActivate?(ctx: SidebarNavActivationContext): void;
}

/**
 * Registry contract. The registry *type* ships in `@cytario/plugin-api`;
 * the registry *implementation* and the rendering of nav entries live
 * in the host (`app/components/sidebarNavRegistry.ts`).
 *
 * Client-only: the host wires `ctx.sidebarNav` into `PluginContext`
 * only when `ctx.env === "client"`; on the server entry the registry
 * is a no-op sink whose `register` is `() => {}`, so a single plugin
 * module can call `ctx.sidebarNav.register(...)` unconditionally and
 * the call takes effect in the client realm only (SDS-CY-010913).
 */
export interface SidebarNavRegistry {
  register(target: SidebarNavTarget, entry: SidebarNavEntry): void;
}
