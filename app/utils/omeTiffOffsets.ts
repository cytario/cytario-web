const OME_TIFF_REGEX = /\.ome\.tiff?$/i;

/**
 * Derives the offset sidecar key for a given OME-TIFF S3 key.
 * Returns the key with `.offsets.json` appended (replacing the `.ome.tif(f)` extension),
 * or `null` if the key is not an OME-TIFF.
 *
 * @example
 * getOffsetKeyForOmeTiff("data/image.ome.tif")   // "data/image.offsets.json"
 * getOffsetKeyForOmeTiff("data/image.ome.tiff")  // "data/image.offsets.json"
 * getOffsetKeyForOmeTiff("data/image.png")        // null
 */
export function getOffsetKeyForOmeTiff(key: string): string | null {
  if (!OME_TIFF_REGEX.test(key)) return null;
  return key.replace(OME_TIFF_REGEX, ".offsets.json");
}

export function isOmeTiff(key: string): boolean {
  return OME_TIFF_REGEX.test(key);
}
