import type {
  CytarioPlugin,
  GateRegistry,
  Logger,
  PluginContext,
  SlotRegistry,
} from "@cytario/plugin-api";
import { IncompatiblePluginError, assertApiCompatible, hostApiVersion } from "@cytario/plugin-api";
import { formatRegistry } from "~/components/ImageViewer/state/formatRegistry";

/**
 * Registries each entry can inject. Gates are live server-side, slots are live
 * client-side; the entry that does not own a registry leaves it undefined and
 * the bootstrap supplies a no-op sink so a plugin's single `register(ctx)` can
 * call both without the wrong-env one taking effect. `env` is set by the entry
 * (`"server"` from entry.server, `"client"` from entry.client) and surfaced on
 * `ctx.env` so a plugin can branch its register() without import-time env
 * sniffing; it defaults to `"client"` for backward compatibility.
 */
export interface BootstrapRegistries {
  gates?: GateRegistry;
  slots?: SlotRegistry;
  env?: PluginContext["env"];
}

const noopGateRegistry: GateRegistry = {
  register: () => {},
};

const noopSlotRegistry: SlotRegistry = {
  register: () => {},
};

/**
 * Iteration body extracted from the generated `plugins.generated.ts`
 * bootstrap. The codegen template now emits a thin wrapper that hands
 * the static plugin list to this helper, which means the iteration
 * logic (apiVersion gate, per-plugin try/catch, scoped FormatRegistry
 * construction) is unit-testable in isolation without dynamically
 * generating + importing TypeScript.
 *
 * Contract:
 * - assertApiCompatible is invoked before register(); incompatible
 *   plugins are logged and skipped.
 * - Each surviving plugin receives a `PluginContext` whose
 *   `FormatRegistry` is scoped to the plugin's name; cross-plugin
 *   registration of the same extension throws DuplicateRegistrationError.
 * - A failing `register()` is caught and logged; subsequent plugins
 *   still run (error containment).
 */
export async function bootstrapPluginsCore(
  plugins: ReadonlyArray<CytarioPlugin>,
  logger: Logger,
  registries?: BootstrapRegistries,
): Promise<void> {
  const gates = registries?.gates ?? noopGateRegistry;
  const slots = registries?.slots ?? noopSlotRegistry;
  // Both entries set `env` explicitly; the default only covers tests that call
  // this helper without registries.
  const env: PluginContext["env"] = registries?.env ?? "client";
  for (const plugin of plugins) {
    try {
      assertApiCompatible(plugin, hostApiVersion);
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
      gates,
      slots,
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
