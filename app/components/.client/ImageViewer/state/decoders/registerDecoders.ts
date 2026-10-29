import { addDecoder } from "geotiff";

import { JP2KDecoder } from "./jp2k-decoder";
import { LZWDecoder } from "./lzwDecoder";

/**
 * Register geotiff decoders. Idempotent — safe to call from any code path
 * that decodes a TIFF (full viewer or dashboard thumbnails).
 */
let registered = false;
export function registerDecoders(): void {
  if (registered) return;
  addDecoder(5, () => LZWDecoder);
  // All three are raw J2K codestreams: 33003/33005 (Aperio/slideio), 34712 (JPEG 2000 per ISO/IEC 15444-1 — tifffile, GDAL, Bio-Formats).
  addDecoder([33003, 33005, 34712], () => JP2KDecoder);
  registered = true;
}
