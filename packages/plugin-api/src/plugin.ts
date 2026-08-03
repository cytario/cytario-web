import type { ContextMenuRegistry } from "./contextMenus";
import type { FormatRegistry } from "./format";
import type { GateRegistry } from "./gates";
import type { HostCapabilities } from "./host";
import type { RouteRegistry } from "./routes";
import type { ServerEndpointRegistry } from "./serverEndpoints";
import type { SidebarNavRegistry } from "./sidebarNav";
import type { SlotRegistry } from "./slots";

export interface Logger {
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
}

export interface PluginContext {
  formats: FormatRegistry;
  gates: GateRegistry; // live server-side; no-op sink client-side
  slots: SlotRegistry; // live client-side; no-op sink server-side
  /**
   * Client-side context-menu contributions. Live client-side; no-op sink
   * server-side. Added additively at hostApiVersion 4.1.0
   * (SDS-CY-010911); a plugin that consumes only the pre-existing surface
   * continues to satisfy the CytarioPlugin contract unchanged.
   */
  contextMenus: ContextMenuRegistry;
  /**
   * Client-side sidebar-navigation contributions. Live client-side; no-op
   * sink server-side. Added additively at hostApiVersion 4.2.0
   * (SDS-CY-010917); a plugin that consumes only the pre-existing surface
   * continues to satisfy the CytarioPlugin contract unchanged.
   */
  sidebarNav: SidebarNavRegistry;
  /**
   * Route contributions. Server + client: the registry is live server-side
   * (validates and records) and a no-op sink client-side. Added additively
   * (SDS-CY-010093/010099); a plugin that consumes only the pre-existing
   * surface continues to satisfy the CytarioPlugin contract unchanged.
   */
  routes: RouteRegistry;
  /**
   * Server-endpoint contributions. Server-only: the registry is live
   * server-side and a no-op sink client-side. Added additively
   * (SDS-CY-010094/010099).
   */
  serverEndpoints: ServerEndpointRegistry;
  /**
   * Server-side host capabilities. Server-only: the capabilities are live
   * server-side and a no-op sink (throws on call) client-side. Added
   * additively (SDS-CY-010097/010098/010099). A plugin captures `ctx.host`
   * during `register(ctx)` and calls its methods from loaders/actions,
   * where the per-request context (session, organization) is available.   */
  host: HostCapabilities;
  logger: Logger;
  /** Lets a plugin branch its register() without import-time env sniffing. */
  env: "server" | "client";
}

export interface CytarioPlugin {
  name: string;
  apiVersion: string;
  register(ctx: PluginContext): void | Promise<void>;
}
