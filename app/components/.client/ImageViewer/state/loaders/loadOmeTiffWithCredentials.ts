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

/**
 * Thrown when the offsets sidecar is absent and viv's IFD chain walk fails
 * (`GeoTIFFImageIndexError`). The viewer catches this to offer the user a
 * "generate offsets" modal when they have write access to the bucket.
 */
export class MissingOffsetsError extends Error {
  constructor() {
    super("Offsets sidecar is missing and the IFD chain is incomplete.");
    this.name = "MissingOffsetsError";
  }
}

/**
 * Strips RGB sub-image elements (thumbnail, overview, label, etc.) from
 * OME-XML so viv's `loadSingleFileOmeTiff` doesn't try to access IFDs that
 * don't exist as separate chain entries.
 *
 * Some producers (e.g. Olympus/OME Bio-Formats) embed multi-channel data
 * images alongside single-IFD RGB sub-images (thumbnail, overview, label).
 * Each RGB sub-image declares `SizeC="3"` but has a single `TiffData` element
 * with `SamplesPerPixel=3`. Viv computes `imageIfdOffset += SizeT*SizeZ*SizeC`
 * per OME image, so it treats the 3-channel RGB image as 3 separate IFDs and
 * walks past the end of the chain → `GeoTIFFImageIndexError`.
 *
 * Heuristic: keep only Image elements where `TiffData` count == `SizeC`
 * (one TiffData per channel). Strip the rest. If all images would be
 * stripped (e.g. a single RGB image), keep the first.
 */
function stripRgbSubImages(omexml: string): string {
  const imageRe = /<Image\b[^>]*>([\s\S]*?)<\/Image>/g;
  const images: { block: string; tiffDataCount: number; sizeC: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = imageRe.exec(omexml)) !== null) {
    const body = m[1];
    const tiffDataCount = (body.match(/<TiffData\b/g) ?? []).length;
    const sizeCMatch = /SizeC="(\d+)"/.exec(body);
    const sizeC = sizeCMatch ? parseInt(sizeCMatch[1], 10) : 0;
    images.push({ block: m[0], tiffDataCount, sizeC });
  }

  if (images.length <= 1) return omexml;

  const hasMismatch = images.some((i) => i.tiffDataCount !== i.sizeC);
  if (!hasMismatch) return omexml;

  const keep = images.filter((i) => i.tiffDataCount === i.sizeC);
  const toKeep = keep.length > 0 ? keep : [images[0]];

  let result = omexml;
  for (const img of images) {
    if (!toKeep.includes(img)) {
      result = result.replace(img.block, "");
    }
  }
  return result;
}

/** Load an OME-TIFF via SigV4-signed S3 requests; delegates to viv. */
export async function loadOmeTiffWithCredentials(
  s3Url: string,
  opts: LoadOptions,
): Promise<{ data: Loader; metadata: Image; offsetsMissing?: boolean }> {
  const { signedFetch, signal, headers } = opts;

  let offsets: number[] | undefined = opts.offsets;
  let sidecarMissing = false;
  if (offsets === undefined) {
    const offsetsUrl = getOffsetsUrl(s3Url);
    if (offsetsUrl) {
      try {
        const res = await signedFetch(offsetsUrl, { signal, headers });
        if (res.ok) {
          const json: unknown = await res.json();
          if (Array.isArray(json) && json.every((v) => typeof v === "number")) {
            offsets = json;
          }
        } else {
          sidecarMissing = true;
        }
      } catch {
        // Sidecar is optional.
      }
    }
  }

  // cacheSize must match viv's internal Infinity to avoid block eviction
  // during IFD parsing of large pyramidal TIFFs. Caller-supplied headers
  // flow into the transport so geotiff's per-tile fetches inherit them.
  const client = new SigV4TiffClient(s3Url, signedFetch, headers);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const source = await fromCustomClient(client as any, {
    cacheSize: Number.POSITIVE_INFINITY,
  });

  // Pre-read IFD 0 and strip RGB sub-images from the OME-XML so viv doesn't
  // walk past the end of the IFD chain. geotiff caches the parsed IFD in
  // ifdRequests[0]; GeoTIFFImage shares the same fileDirectory object
  // reference, so mutating the property in-place is visible to viv's
  // subsequent getImage(0) call — no extra network round-trip.
  try {
    const firstImage = await source.getImage(0);
    const omexml = firstImage.fileDirectory.ImageDescription;
    if (typeof omexml === "string") {
      const stripped = stripRgbSubImages(omexml);
      if (stripped !== omexml) {
        console.warn(
          "[loadOmeTiffWithCredentials] Stripping RGB sub-images " +
            "(thumbnail/overview/label) from OME-XML to prevent IFD chain overrun.",
        );
        firstImage.fileDirectory.ImageDescription = stripped;
      }
    }
  } catch {
    // If pre-read fails, let viv's loadOmeTiff surface the real error.
  }

  let result;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    result = await (loadOmeTiff as any)("", { source, offsets });
  } catch (error) {
    if (sidecarMissing && error instanceof Error && error.name === "GeoTIFFImageIndexError") {
      throw new MissingOffsetsError();
    }
    throw error;
  }

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
    offsetsMissing: sidecarMissing,
  };
}
