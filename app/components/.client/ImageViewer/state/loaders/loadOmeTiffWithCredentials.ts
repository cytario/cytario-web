import { loadOmeTiff } from "@hms-dbmi/viv";
import { fromCustomClient } from "geotiff";

import type { Image, Loader } from "../store/ome.tif.types";
import { SigV4TiffClient } from "../transport/SigV4TiffClient";
import type { ConnectionConfig } from "~/.generated/client";
import { getOffsetKeyForOmeTiff } from "~/utils/omeTiffOffsets";
import type { SignedFetch } from "~/utils/signedFetch";
import { constructS3Url } from "~/utils/zarrUtils";

interface LoadOmeTiffOptions {
  signedFetch: SignedFetch;
  connectionConfig: ConnectionConfig;
  pathName: string;
}

/**
 * Load an OME-TIFF using SigV4-signed S3 requests (no presigned URLs).
 * Uses fromCustomClient for the GeoTIFF transport, then delegates to viv's
 * loadOmeTiff for OME-XML parsing and TiffPixelSource construction.
 *
 * Requires @vivjs/loaders to be patched to accept a `source` option
 * (see patches/@vivjs+loaders+0.20.0.patch).
 */
export async function loadOmeTiffWithCredentials(
  s3Url: string,
  options: LoadOmeTiffOptions,
): Promise<{ data: Loader; metadata: Image }> {
  const { signedFetch, connectionConfig, pathName } = options;

  // Fetch optional offset sidecar via signed request
  const offsetKey = getOffsetKeyForOmeTiff(pathName);
  let offsets: number[] | undefined;
  if (offsetKey) {
    const offsetUrl = constructS3Url(connectionConfig, offsetKey);
    try {
      const res = await signedFetch(offsetUrl);
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
  // The `source` option is from our patch (see patches/@vivjs+loaders+0.20.0.patch)
  // and is not in viv's type definitions yet.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await (loadOmeTiff as any)("", { source, offsets });

  return {
    data: result.data as unknown as Loader,
    metadata: result.metadata as unknown as Image,
  };
}
