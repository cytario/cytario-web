import type { ContextMenuRegistry } from "./contextMenus";
import type { FormatRegistry } from "./format";
import type { GateRegistry } from "./gates";
import type { HostCapabilities } from "./host";
import type { RouteRegistry } from "./routes";
import type { ServerEndpointRegistry } from "./serverEndpoints";
import type { SidebarNavRegistry } from "./sidebarNav";
import type { SlotRegistry } from "./slots";
import type { StoragePickerRegistry } from "./storagePicker";
import type { UserManagementGateRegistry } from "./userManagementGate";
import type { ViewerRegistry } from "./viewer";

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
  /** Client-side context-menu contributions. Live client-side; no-op sink server-side. */
  contextMenus: ContextMenuRegistry;
  /** Client-side sidebar-navigation contributions. Live client-side; no-op sink server-side. */
  sidebarNav: SidebarNavRegistry;
  /**
   * Route contributions. Server + client: the registry is live server-side
   * (validates and records) and a no-op sink client-side.
   */
  routes: RouteRegistry;
  /** Server-endpoint contributions. Server-only: no-op sink client-side. */
  serverEndpoints: ServerEndpointRegistry;
  /**
   * Server-side host capabilities. Server-only: live server-side and a no-op
   * sink (throws on call) client-side. A plugin captures `ctx.host` during
   * `register(ctx)` and calls its methods from loaders/actions, where the
   * per-request context (session, organization) is available.
   */
  host: HostCapabilities;
  /** Client-side storage picker. Live client-side; no-op sink server-side. */
  storagePicker: StoragePickerRegistry;
  /**
   * Server-side single-slot user-management gate. Server-only: the registry
   * is live server-side and a no-op sink client-side. The gate request
   * carries `orgTier` and the deny outcome carries
   * `resolveUrl`/`resolveLabel` — additive at hostApiVersion 6.2.0.
   */
  userMgmtGate: UserManagementGateRegistry;
  /** Client-side viewer contributions. Live client-side; no-op sink server-side. */
  viewers: ViewerRegistry;
  logger: Logger;
  /** Lets a plugin branch its register() without import-time env sniffing. */
  env: "server" | "client";
}

export interface CytarioPlugin {
  name: string;
  apiVersion: string;
  register(ctx: PluginContext): void | Promise<void>;
}
