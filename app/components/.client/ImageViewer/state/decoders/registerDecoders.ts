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
  addDecoder(33005, () => JP2KDecoder);
  registered = true;
}
