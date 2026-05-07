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

  // ────────────────────────────────────────────────────────────────────
  // OME-XML sanitizer (C-78). Some producers (slideio as of 2026-05)
  // emit <Pixels Interleaved="true"> for planar multi-IFD layouts with
  // SamplesPerPixel=1 per channel. Viv's loader trusts the flag and
  // appends a phantom _c=3 dim to image shape, routing tiles to the
  // 8-bit RGB BitmapLayer path instead of XRLayer (multi-channel,
  // any bit depth). The OME 2016-06 schema's wording for Interleaved
  // is RGB-specific ("RGBRGBRGB... vs RRR...GGG...BBB...") and silent
  // on N>3 channels, so different readers (viv, Bio-Formats) interpret
  // it differently and producers can't satisfy all of them at once —
  // see C-78 thread for the spec rabbit hole. Detect the contradiction
  // here and clear the flag before viv consumes it. Defensive guard,
  // not tied to any upstream fix landing.
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
  // ────────────────────────────────────────────────────────────────────

  return {
    data: result.data as unknown as Loader,
    metadata: result.metadata as unknown as Image,
  };
}
