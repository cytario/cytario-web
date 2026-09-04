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

interface OmeImageBlock {
  block: string;
  sizeZ: number;
  sizeC: number;
  sizeT: number;
  interleaved: boolean;
  channelSamples: number[];
  tiffData: { ifd?: number; planeCount?: number }[];
}

function attrNum(attrs: string, name: string): number | undefined {
  const match = new RegExp(`${name}="(\\d+)"`).exec(attrs);
  return match ? Number(match[1]) : undefined;
}

function parseOmeImageBlock(block: string, body: string): OmeImageBlock | null {
  const pixels = /<Pixels\b([^>]*)>/.exec(body);
  if (!pixels) return null;
  const pxAttrs = pixels[1];
  const sizeZ = attrNum(pxAttrs, "SizeZ");
  const sizeC = attrNum(pxAttrs, "SizeC");
  const sizeT = attrNum(pxAttrs, "SizeT");
  if (!sizeZ || !sizeC || !sizeT) return null;

  const channelSamples = [...body.matchAll(/<Channel\b([^>]*)>/g)].map(
    (cm) => attrNum(cm[1], "SamplesPerPixel") ?? 1,
  );
  const tiffData = [...body.matchAll(/<TiffData\b([^>]*)>/g)].map((tm) => ({
    ifd: attrNum(tm[1], "IFD"),
    planeCount: attrNum(tm[1], "PlaneCount"),
  }));

  return {
    block,
    sizeZ,
    sizeC,
    sizeT,
    interleaved: /Interleaved="(true|1)"/.test(pxAttrs),
    channelSamples,
    tiffData,
  };
}

/**
 * Whether the image's declared storage breaks viv's IFD accounting, which
 * assumes every OME Image occupies exactly SizeZ*SizeT*SizeC IFDs. An image
 * is provably incompatible when its OME-XML declares interleaved storage
 * (one IFD per z-t plane, not one per channel) via Channel SamplesPerPixel
 * or Pixels Interleaved, or when its TiffData plane coverage — PlaneCount,
 * else 1 when IFD is given (OME-XML defaults) — doesn't cover every plane.
 * A bare TiffData means "the whole file" per the schema and proves nothing.
 */
function breaksVivIfdMath(img: OmeImageBlock): boolean {
  const { sizeZ, sizeT, sizeC, interleaved, channelSamples, tiffData } = img;
  const expected = sizeZ * sizeT * sizeC;
  if (interleaved || channelSamples.some((spp) => spp > 1)) {
    return sizeZ * sizeT !== expected;
  }
  let declared = 0;
  for (const td of tiffData) {
    if (td.planeCount !== undefined) {
      declared += td.planeCount;
    } else if (td.ifd !== undefined) {
      declared += 1;
    } else {
      return false;
    }
  }
  return declared !== expected;
}

/**
 * Strips OME Images viv cannot index. viv's single-file loader walks IFDs as
 * SizeZ*SizeT*SizeC blocks per Image and — without SubIFDs — uses the Image
 * count as the resolution-level count, so an interleaved RGB sub-image
 * (thumbnail/overview/label: SizeC=3 stored in one IFD) overruns the IFD
 * chain with GeoTIFFImageIndexError and inflates the level count. The first
 * Image is always kept; stripping runs from the first incompatible Image to
 * the end so the kept Images' IFD accounting stays contiguous.
 */
export function stripUnsupportedSubImages(omexml: string): string {
  const images: OmeImageBlock[] = [];
  for (const m of omexml.matchAll(/<Image\b[^>]*>([\s\S]*?)<\/Image>/g)) {
    const parsed = parseOmeImageBlock(m[0], m[1]);
    if (parsed) images.push(parsed);
  }

  if (images.length <= 1) return omexml;

  const firstBad = images.findIndex((img, i) => i > 0 && breaksVivIfdMath(img));
  if (firstBad === -1) return omexml;

  let result = omexml;
  for (const img of images.slice(firstBad)) {
    result = result.replace(img.block, "");
  }
  return result;
}

/** Load an OME-TIFF via SigV4-signed S3 requests; delegates to viv. */
export async function loadOmeTiffWithCredentials(
  s3Url: string,
  opts: LoadOptions,
): Promise<{ data: Loader; metadata: Image }> {
  const { signedFetch, signal, headers } = opts;

  // Sidecar is optional — fetch only if caller did not pre-supply offsets.
  // Caller-supplied headers (SDS-CY-010050) must reach EVERY network
  // request the handler issues, including the sidecar fetch.
  let offsets: number[] | undefined = opts.offsets;
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

  // Pre-read IFD 0 and strip sub-images viv cannot index (RGB thumbnail/
  // overview/label: all channels interleaved in one IFD). viv walks IFDs as
  // SizeZ*SizeT*SizeC blocks per OME Image and — without SubIFDs — uses the
  // Image count as the resolution-level count, so such sub-images overrun
  // the IFD chain (GeoTIFFImageIndexError) and inflate the level count.
  // geotiff caches the parsed IFD in ifdRequests[0]; GeoTIFFImage shares the
  // same fileDirectory object reference, so the in-place mutation is visible
  // to viv's subsequent getImage(0) call — no extra network round-trip.
  try {
    const firstImage = await source.getImage(0);
    const omexml = firstImage.fileDirectory.ImageDescription;
    if (typeof omexml === "string") {
      const stripped = stripUnsupportedSubImages(omexml);
      if (stripped !== omexml) {
        console.warn(
          "[loadOmeTiffWithCredentials] Stripping sub-images viv cannot " +
            "index (RGB thumbnail/overview/label) from OME-XML to prevent " +
            "IFD chain overrun.",
        );
        firstImage.fileDirectory.ImageDescription = stripped;
      }
    }
  } catch {
    // If pre-read fails, let viv's loadOmeTiff surface the real error.
  }

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
