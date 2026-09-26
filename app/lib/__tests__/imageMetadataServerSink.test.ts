import { bootstrapPluginsCore } from "../bootstrapPluginsCore";
import type { CytarioPlugin, PluginContext } from "@cytario/plugin-api";

/**
 * The client capabilities are client-live: the server realm must be handed a
 * capability object whose members are null, so a plugin that captures
 * `ctx.client` at register time degrades gracefully rather than throwing. This
 * is deliberately unlike `ctx.host`, which throws when called server-side.
 */
const captureContext = async (
  registries: Parameters<typeof bootstrapPluginsCore>[2],
): Promise<PluginContext> => {
  let captured: PluginContext | undefined;
  const plugin: CytarioPlugin = {
    name: "capture-plugin",
    apiVersion: "^8.0.0",
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

test("the server realm's client capabilities are null and do not throw", async () => {
  // No `client` passed — exactly what entry.server.tsx does.
  const ctx = await captureContext({ env: "server" });

  expect(ctx.client.storagePicker).toBeNull();
  expect(ctx.client.imageMetadata).toBeNull();
});

test("a client realm without the capabilities also degrades to null", async () => {
  const ctx = await captureContext({ env: "client" });

  expect(ctx.client.storagePicker).toBeNull();
  expect(ctx.client.imageMetadata).toBeNull();
});
