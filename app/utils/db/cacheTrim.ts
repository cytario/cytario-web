import { trimDecoderCache } from "~/components/.client/ImageViewer/state/decoders/genericDecoder";
import { trimSharedTileCaches } from "~/components/.client/ImageViewer/utils/sharedTileCache";

/**
 * Best-effort eviction of the process-wide decoded-data caches under memory
 * pressure; dropped data refetches on demand.
 */
export const trimCaches = (): void => {
  trimSharedTileCaches();
  trimDecoderCache();
};
