import type { CytarioPlugin, Logger, PluginContext } from "@cytario/plugin-api";
import { IncompatiblePluginError, assertApiCompatible, hostApiVersion } from "@cytario/plugin-api";
import { formatRegistry } from "~/components/ImageViewer/state/formatRegistry";

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
 *   still run (SDS-CY-010403 error containment).
 */
export async function bootstrapPluginsCore(
  plugins: ReadonlyArray<CytarioPlugin>,
  logger: Logger,
): Promise<void> {
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
