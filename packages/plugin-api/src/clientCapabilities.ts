import type { ImageMetadata } from "./imageMetadata";
import type { StoragePicker } from "./storagePicker";

/**
 * Host-provided capabilities that are live in the browser and a null stub in
 * the server realm, reached through `ctx.client` — the client-side counterpart
 * of `ctx.host` (which is server-only, and whose client-side stub throws).
 *
 * These are things the host *offers* the plugin, not contributions the plugin
 * registers: browser SigV4 signing and host UI rendering are unavailable in
 * the Node runtime, so a plugin reaches them from client code and treats
 * `null` as "this realm cannot provide it".
 */
export interface ClientCapabilities {
  /** The host's storage picker, or null in the server realm. */
  storagePicker: StoragePicker | null;
  /** The host's image-metadata reads, or null in the server realm. */
  imageMetadata: ImageMetadata | null;
}
