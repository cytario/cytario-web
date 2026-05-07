import { loadOmeTiff } from "@hms-dbmi/viv";
import { fromCustomClient } from "geotiff";

import type { Image, Loader } from "../store/ome.tif.types";
import { SigV4TiffClient } from "../transport/SigV4TiffClient";
import type { SignedFetch } from "~/utils/signedFetch";

/** Derive the offset sidecar URL from the TIFF URL (replace .ome.tif(f) → .offsets.json). */
function getOffsetsUrl(tiffUrl: string): string | null {
  const match = tiffUrl.match(/\.ome\.tiff?$/i);
  if (!match) return null;
  return tiffUrl.replace(/\.ome\.tiff?$/i, ".offsets.json");
}

/**
 * Load an OME-TIFF using SigV4-signed S3 requests.
 * Uses fromCustomClient for the GeoTIFF transport, then delegates to viv's
 * loadOmeTiff for OME-XML parsing and TiffPixelSource construction.
 */
export async function loadOmeTiffWithCredentials(
  s3Url: string,
  signedFetch: SignedFetch,
): Promise<{ data: Loader; metadata: Image }> {
  // Fetch optional offset sidecar via signed request
  const offsetsUrl = getOffsetsUrl(s3Url);
  let offsets: number[] | undefined;
  if (offsetsUrl) {
    try {
      const res = await signedFetch(offsetsUrl);
      if (res.ok) {
        const json: unknown = await res.json();
        if (Array.isArray(json) && json.every((v) => typeof v === "number")) {
          offsets = json;
        }
      }
    } catch {
      // Offset sidecar is optional — continue without it
    }
  }

  // Create SigV4-signed GeoTIFF transport.
  // cacheSize must match what viv uses internally (Infinity) to avoid
  // block eviction during IFD parsing of large pyramidal TIFFs.
  const client = new SigV4TiffClient(s3Url, signedFetch);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const source = await fromCustomClient(client as any, {
    cacheSize: Number.POSITIVE_INFINITY,
  });

  // Delegate to viv — it handles OME-XML parsing, TiffPixelSource construction,
  // and pyramid indexing using the pre-constructed GeoTIFF.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await (loadOmeTiff as any)("", { source, offsets });

  return {
    data: result.data as unknown as Loader,
    metadata: result.metadata as unknown as Image,
  };
}
