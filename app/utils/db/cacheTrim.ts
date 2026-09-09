import { trimDecoderCache } from "~/components/.client/ImageViewer/state/decoders/genericDecoder";
import { trimSharedTileCaches } from "~/components/.client/ImageViewer/utils/sharedTileCache";

/**
 * Best-effort eviction of the process-wide decoded-data caches under memory
 * pressure. Dropped data refetches on demand; retained data keeps the viewer
 * usable. Called by the memory watchdog.
 */
export const trimCaches = (): void => {
  trimSharedTileCaches();
  trimDecoderCache();
};
