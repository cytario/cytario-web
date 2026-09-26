import { bootstrapPluginsCore } from "../bootstrapPluginsCore";
import type { CytarioPlugin, PluginContext } from "@cytario/plugin-api";

/**
 * The image-metadata capability is client-live: the server realm must be handed
 * a sink whose `get()` returns null, so a plugin that captures `ctx.imageMetadata`
 * at register time degrades gracefully rather than throwing. This is deliberately
 * unlike `ctx.host`, which throws when called server-side.
 */
const captureContext = async (
  registries: Parameters<typeof bootstrapPluginsCore>[2],
): Promise<PluginContext> => {
  let captured: PluginContext | undefined;
  const plugin: CytarioPlugin = {
    name: "capture-plugin",
    apiVersion: "^6.8.0",
    register(ctx) {
      captured = ctx;
    },
  };
  await bootstrapPluginsCore([plugin], silentLogger(), registries);
  if (!captured) throw new Error("the plugin was not registered");
  return captured;
};

const silentLogger = () => ({
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
});

test("the server realm's imageMetadata sink returns null and does not throw", async () => {
  // No `imageMetadata` registry passed — exactly what entry.server.tsx does.
  const ctx = await captureContext({ env: "server" });

  expect(ctx.imageMetadata.get()).toBeNull();
});

test("a client realm without the registry also degrades to null", async () => {
  const ctx = await captureContext({ env: "client" });

  expect(ctx.imageMetadata.get()).toBeNull();
});
