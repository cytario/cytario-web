import type {
  CytarioPlugin,
  ContextMenuRegistry,
  GateRegistry,
  HostCapabilities,
  Logger,
  PluginContext,
  RouteRegistry,
  ServerEndpointRegistry,
  SidebarNavRegistry,
  SlotRegistry,
  StoragePickerRegistry,
  ImageMetadataRegistry,
  UserManagementGateRegistry,
  ViewerRegistry,
} from "@cytario/plugin-api";
import { IncompatiblePluginError, assertApiCompatible } from "@cytario/plugin-api";
import { formatRegistry } from "~/components/ImageViewer/state/formatRegistry";
import { HOST_API_VERSION } from "~/lib/hostApiVersion";
import { noopHostCapabilities } from "~/lib/noopHostCapabilities";

// `env` is set by the entry ("server" from entry.server, "client" from
// entry.client) and surfaced on `ctx.env` so a plugin can branch its
// register() without import-time env sniffing; the entry that does not own a
// registry leaves it undefined and the bootstrap supplies a no-op sink.
/** A registry the bootstrap binds to a plugin name before handing it to `ctx`. */
interface Scoped<R> {
  scopedFor(pluginName: string): R;
}

export interface BootstrapRegistries {
  gates?: Scoped<GateRegistry>;
  slots?: Scoped<SlotRegistry>;
  contextMenus?: Scoped<ContextMenuRegistry>;
  sidebarNav?: Scoped<SidebarNavRegistry>;
  storagePicker?: Scoped<StoragePickerRegistry>;
  imageMetadata?: Scoped<ImageMetadataRegistry>;
  viewers?: Scoped<ViewerRegistry>;
  routes?: Scoped<RouteRegistry>;
  serverEndpoints?: Scoped<ServerEndpointRegistry>;
  /** Server-only single-slot user-management gate (not scoped to a plugin). */
  userMgmtGate?: UserManagementGateRegistry;
  /** Server-only capability object — not scoped to a plugin name. */
  host?: HostCapabilities;
  env?: PluginContext["env"];
}

const noopGateRegistry: Scoped<GateRegistry> = {
  scopedFor: () => ({ register: () => {} }),
};

const noopSlotRegistry: Scoped<SlotRegistry> = {
  scopedFor: () => ({ register: () => {} }),
};

const noopContextMenuRegistry: Scoped<ContextMenuRegistry> = {
  scopedFor: () => ({ register: () => {} }),
};

const noopSidebarNavRegistry: Scoped<SidebarNavRegistry> = {
  scopedFor: () => ({ register: () => {} }),
};

const noopStoragePickerRegistry: Scoped<StoragePickerRegistry> = {
  scopedFor: () => ({ get: () => null }),
};

const noopImageMetadataRegistry: Scoped<ImageMetadataRegistry> = {
  scopedFor: () => ({ get: () => null }),
};

const noopViewerRegistry: Scoped<ViewerRegistry> = {
  scopedFor: () => ({ register: () => {} }),
};

const noopRouteRegistry: Scoped<RouteRegistry> = {
  scopedFor: () => ({ register: () => {} }),
};

const noopServerEndpointRegistry: Scoped<ServerEndpointRegistry> = {
  scopedFor: () => ({ register: () => {} }),
};

const noopUserManagementGateRegistry: UserManagementGateRegistry = {
  register: () => {},
};

// A failing `register()` is caught and logged so subsequent plugins still
// run; each plugin's `FormatRegistry` is scoped to its name (cross-plugin
// registration of the same extension throws DuplicateRegistrationError).
export async function bootstrapPluginsCore(
  plugins: ReadonlyArray<CytarioPlugin>,
  logger: Logger,
  registries?: BootstrapRegistries,
): Promise<void> {
  const gates = registries?.gates ?? noopGateRegistry;
  const slots = registries?.slots ?? noopSlotRegistry;
  const contextMenus = registries?.contextMenus ?? noopContextMenuRegistry;
  const sidebarNav = registries?.sidebarNav ?? noopSidebarNavRegistry;
  const storagePicker = registries?.storagePicker ?? noopStoragePickerRegistry;
  const imageMetadata = registries?.imageMetadata ?? noopImageMetadataRegistry;
  const viewers = registries?.viewers ?? noopViewerRegistry;
  const routes = registries?.routes ?? noopRouteRegistry;
  const serverEndpoints = registries?.serverEndpoints ?? noopServerEndpointRegistry;
  const userMgmtGate = registries?.userMgmtGate ?? noopUserManagementGateRegistry;
  const host = registries?.host ?? noopHostCapabilities;
  // The default only covers tests that call this helper without registries.
  const env: PluginContext["env"] = registries?.env ?? "client";
  for (const plugin of plugins) {
    try {
      assertApiCompatible(plugin, HOST_API_VERSION);
    } catch (err) {
      const message =
        err instanceof IncompatiblePluginError
          ? err.message
          : err instanceof Error
            ? err.message
            : String(err);
      logger.error(`Skipping incompatible plugin "${plugin?.name ?? "<unknown>"}"`, {
        error: message,
      });
      continue;
    }

    const ctx: PluginContext = {
      logger,
      formats: formatRegistry.scopedFor(plugin.name),
      gates: gates.scopedFor(plugin.name),
      slots: slots.scopedFor(plugin.name),
      contextMenus: contextMenus.scopedFor(plugin.name),
      sidebarNav: sidebarNav.scopedFor(plugin.name),
      storagePicker: storagePicker.scopedFor(plugin.name),
      imageMetadata: imageMetadata.scopedFor(plugin.name),
      viewers: viewers.scopedFor(plugin.name),
      routes: routes.scopedFor(plugin.name),
      serverEndpoints: serverEndpoints.scopedFor(plugin.name),
      userMgmtGate,
      host,
      env,
    };

    try {
      await plugin.register(ctx);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`Plugin "${plugin.name}" register() threw — skipping`, {
        error: message,
      });
    }
  }
}
