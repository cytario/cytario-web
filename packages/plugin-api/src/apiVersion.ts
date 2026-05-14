import { satisfies } from "./satisfies";

export class IncompatiblePluginError extends Error {
  override readonly name = "IncompatiblePluginError";
  constructor(message: string) {
    super(message);
  }
}

/** Hand-rolled in lieu of zod to keep the published bundle dependency-free. */
function isPluginShape(
  plugin: unknown,
): plugin is { name: string; apiVersion: string } {
  if (plugin === null || typeof plugin !== "object") return false;
  const obj = plugin as { name?: unknown; apiVersion?: unknown };
  return (
    typeof obj.name === "string" &&
    obj.name.length > 0 &&
    typeof obj.apiVersion === "string" &&
    obj.apiVersion.length > 0
  );
}

/**
 * Only throws `IncompatiblePluginError` — the bootstrap relies on this to
 * skip incompatible plugins without crashing.
 */
export function assertApiCompatible(plugin: unknown, hostVersion: string): void {
  if (!isPluginShape(plugin)) {
    throw new IncompatiblePluginError(
      "Plugin shape invalid: missing or non-string `name` / `apiVersion`",
    );
  }
  if (!satisfies(plugin.apiVersion, hostVersion)) {
    throw new IncompatiblePluginError(
      `Plugin "${plugin.name}" requires @cytario/plugin-api ${plugin.apiVersion}, host is ${hostVersion}`,
    );
  }
}
