import { loadOmeTiff } from "@hms-dbmi/viv";
import { fromCustomClient } from "geotiff";

import type { Image, Loader } from "../store/ome.tif.types";
import { SigV4TiffClient } from "../transport/SigV4TiffClient";
import type { LoadOptions } from "@cytario/plugin-api";

// `.ome.tif(f)` → `.offsets.json` (returns null for non-OME-TIFF URLs).
function getOffsetsUrl(tiffUrl: string): string | null {
  const match = tiffUrl.match(/\.ome\.tiff?$/i);
  if (!match) return null;
  return tiffUrl.replace(/\.ome\.tiff?$/i, ".offsets.json");
}

/** Load an OME-TIFF via SigV4-signed S3 requests; delegates to viv. */
export async function loadOmeTiffWithCredentials(
  s3Url: string,
  opts: LoadOptions,
): Promise<{ data: Loader; metadata: Image }> {
  const { signedFetch, signal } = opts;

  // Sidecar is optional — fetch only if caller did not pre-supply offsets.
  let offsets: number[] | undefined = opts.offsets;
  if (offsets === undefined) {
    const offsetsUrl = getOffsetsUrl(s3Url);
    if (offsetsUrl) {
      try {
        const res = await signedFetch(offsetsUrl, { signal });
        if (res.ok) {
          const json: unknown = await res.json();
          if (Array.isArray(json) && json.every((v) => typeof v === "number")) {
            offsets = json;
          }
        }
      } catch {
        // Sidecar is optional.
      }
    }
  }

  // cacheSize must match viv's internal Infinity to avoid block eviction
  // during IFD parsing of large pyramidal TIFFs.
  const client = new SigV4TiffClient(s3Url, signedFetch);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const source = await fromCustomClient(client as any, {
    cacheSize: Number.POSITIVE_INFINITY,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await (loadOmeTiff as any)("", { source, offsets });

  // OME-XML sanitizer (C-78). Some producers emit Interleaved=true on planar
  // multi-IFD layouts with SamplesPerPixel=1 per channel. Viv then appends a
  // phantom _c=3 dim and routes tiles to the 8-bit RGB BitmapLayer instead
  // of XRLayer. Detect and clear before viv consumes it.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pixels = (result.metadata as any)?.Pixels;
  const channels = (pixels?.Channels ?? []) as Array<{
    SamplesPerPixel?: number;
  }>;
  const planarLie =
    pixels?.Interleaved === true &&
    channels.length > 0 &&
    channels.every((c) => c.SamplesPerPixel === 1);

  if (planarLie) {
    console.warn(
      "[loadOmeTiffWithCredentials] OME-XML claims Interleaved=true but " +
        "all channels have SamplesPerPixel=1 — stripping phantom _c=3 dim.",
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const level of result.data as any[]) {
      if (
        level?.shape?.[level.shape.length - 1] === 3 &&
        level?.labels?.[level.labels.length - 1] === "_c"
      ) {
        level.shape = level.shape.slice(0, -1);
        level.labels = level.labels.slice(0, -1);
      }
    }
    pixels.Interleaved = false;
  }

  return {
    data: result.data as unknown as Loader,
    metadata: result.metadata as unknown as Image,
  };
}
