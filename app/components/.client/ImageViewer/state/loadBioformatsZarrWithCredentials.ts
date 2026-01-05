import type { Credentials } from "@aws-sdk/client-sts";
import { ZarrPixelSource } from "@hms-dbmi/viv";
// @ts-expect-error - zarr package has type resolution issues with package.json exports
import { openGroup, ZarrArray } from "zarr";

import { CredentialedHTTPStore } from "./CredentialedHTTPStore";
import type { Image, Loader } from "./ome.tif.types";
import type { ClientBucketConfig } from "~/utils/credentialsStore/useCredentialsStore";

// bioformats2raw v3 layout paths
const METADATA_PATH_V3 = "OME/METADATA.ome.xml";
const IMAGE_SERIES_PATH = "0"; // First image series

interface LoadOptions {
  credentials: Credentials;
  bucketConfig?: ClientBucketConfig;
}

/**
 * Load a bioformats2raw v3 zarr image using AWS credentials for S3 authentication.
 *
 * Expects the bioformats2raw v3 layout:
 * ```
 * {source}/
 * ├── .zattrs              # {"bioformats2raw.layout": 3}
 * ├── .zgroup
 * ├── 0/                   # Image series 0
 * │   ├── .zattrs          # Contains multiscales + omero metadata
 * │   ├── 0/, 1/, 2/...    # Resolution levels
 * └── OME/
 *     └── METADATA.ome.xml
 * ```
 */
export async function loadBioformatsZarrWithCredentials(
  source: string,
  options: LoadOptions
): Promise<{ data: Loader; metadata: Image }> {
  const { credentials, bucketConfig } = options;
  const baseUrl = source.endsWith("/") ? source.slice(0, -1) : source;

  // Create credentialed store for the root zarr directory
  const store = new CredentialedHTTPStore(baseUrl, credentials, bucketConfig);

  // Fetch XML metadata from OME/METADATA.ome.xml
  const xmlBuffer = await store.getItem(METADATA_PATH_V3);
  const xmlText = new TextDecoder().decode(xmlBuffer);

  // Parse OME-XML metadata
  const metadata = parseOmeXml(xmlText);

  // Load zarr pyramid from image series 0
  const { data } = await loadMultiscales(store, IMAGE_SERIES_PATH);
  const tileSize = guessTileSize(data[0]);

  // Guess labels based on data shape and metadata
  const resolvedLabels = guessBioformatsLabels(data[0], metadata);

  // Create ZarrPixelSource for each resolution level
  // Cast labels to the expected type - viv's Labels type is overly strict
  const pyramid = data.map(
    (arr) =>
      new ZarrPixelSource(
        arr,
        resolvedLabels as unknown as ["t", "c", "z", "y", "x"],
        tileSize
      )
  ) as Loader;

  return { data: pyramid, metadata };
}

/**
 * Load multiscale zarr data from a store.
 * Replicates viv's internal loadMultiscales function.
 */
async function loadMultiscales(
  store: CredentialedHTTPStore,
  path: string = ""
): Promise<{ data: ZarrArray[]; labels: string[] }> {
  const grp = await openGroup(store, path);
  const rootAttrs = (await grp.attrs.asObject()) as {
    multiscales?: Array<{
      datasets: Array<{ path: string }>;
      axes?: Array<string | { name: string }>;
    }>;
  };

  let paths = ["0"];
  let labels: string[] = ["t", "c", "z", "y", "x"];

  if (rootAttrs.multiscales) {
    const { datasets, axes } = rootAttrs.multiscales[0];
    paths = datasets.map((d) => d.path);

    if (axes) {
      labels = axes.map((axis) =>
        typeof axis === "string" ? axis : axis.name
      );
    }
  }

  const data = await Promise.all(
    paths.map((p) => grp.getItem(p) as Promise<ZarrArray>)
  );

  return { data, labels };
}

/**
 * Guess appropriate tile size from zarr chunk dimensions.
 * Exported for testing.
 */
export function guessTileSize(arr: ZarrArray): number {
  const shape = arr.shape;
  const chunks = arr.chunks;

  // Check if interleaved (last dim is 3 or 4)
  const lastDimSize = shape[shape.length - 1];
  const interleaved = lastDimSize === 3 || lastDimSize === 4;

  const [yChunk, xChunk] = chunks.slice(interleaved ? -3 : -2);
  const size = Math.min(yChunk, xChunk);

  // Return previous power of 2
  return Math.pow(2, Math.floor(Math.log2(size)));
}

/**
 * Guess dimension labels based on zarr shape and OME-XML metadata.
 * Exported for testing.
 */
export function guessBioformatsLabels(
  arr: ZarrArray,
  metadata: Image
): string[] {
  const shape = arr.shape;
  const pixels = metadata.Pixels;

  // Check if shape matches OME-Zarr layout (TCZYX)
  const omeZarrShape = [
    pixels.SizeT,
    pixels.SizeC,
    pixels.SizeZ,
    pixels.SizeY,
    pixels.SizeX,
  ];

  const isOmeZarr = shape.every(
    (size: number, i: number) => omeZarrShape[i] === size
  );

  if (isOmeZarr) {
    return ["t", "c", "z", "y", "x"];
  }

  // Fall back to dimension order from metadata
  return pixels.DimensionOrder.toLowerCase().split("").reverse();
}

/**
 * Parse OME-XML string into metadata object.
 * Simplified parser that extracts the essential fields.
 * Exported for testing.
 */
export function parseOmeXml(xmlString: string): Image {
  const parser = new DOMParser();
  // Strip trailing null character if present (common in bioformats2raw output)
  const cleanedXml = xmlString.endsWith("\0")
    ? xmlString.slice(0, -1)
    : xmlString;
  const doc = parser.parseFromString(cleanedXml, "application/xml");

  const imageEl = doc.querySelector("Image");
  const pixelsEl = doc.querySelector("Pixels");

  if (!pixelsEl) {
    throw new Error("Invalid OME-XML: missing Pixels element");
  }

  const channels = Array.from(doc.querySelectorAll("Channel")).map(
    (ch, index) => ({
      ID: ch.getAttribute("ID") || `Channel:0:${index}`,
      Name: ch.getAttribute("Name") || undefined,
      SamplesPerPixel: ch.getAttribute("SamplesPerPixel")
        ? parseInt(ch.getAttribute("SamplesPerPixel")!, 10)
        : undefined,
      Color: parseColor(ch.getAttribute("Color")),
    })
  );

  const getAttr = (el: Element, name: string) => el.getAttribute(name);
  const getNumAttr = (el: Element, name: string) => {
    const val = el.getAttribute(name);
    return val ? parseInt(val, 10) : 0;
  };
  const getFloatAttr = (el: Element, name: string) => {
    const val = el.getAttribute(name);
    return val ? parseFloat(val) : undefined;
  };

  return {
    ID: getAttr(imageEl!, "ID") || "Image:0",
    Name: getAttr(imageEl!, "Name") || undefined,
    AquisitionDate: "",
    Pixels: {
      ID: getAttr(pixelsEl, "ID") || "Pixels:0",
      DimensionOrder: (getAttr(pixelsEl, "DimensionOrder") ||
        "XYZCT") as Image["Pixels"]["DimensionOrder"],
      Type: (getAttr(pixelsEl, "Type") || "uint16") as Image["Pixels"]["Type"],
      SizeT: getNumAttr(pixelsEl, "SizeT") || 1,
      SizeC: getNumAttr(pixelsEl, "SizeC") || 1,
      SizeZ: getNumAttr(pixelsEl, "SizeZ") || 1,
      SizeY: getNumAttr(pixelsEl, "SizeY"),
      SizeX: getNumAttr(pixelsEl, "SizeX"),
      PhysicalSizeX: getFloatAttr(pixelsEl, "PhysicalSizeX"),
      PhysicalSizeY: getFloatAttr(pixelsEl, "PhysicalSizeY"),
      PhysicalSizeZ: getFloatAttr(pixelsEl, "PhysicalSizeZ"),
      PhysicalSizeXUnit: (getAttr(pixelsEl, "PhysicalSizeXUnit") ||
        "µm") as Image["Pixels"]["PhysicalSizeXUnit"],
      PhysicalSizeYUnit: (getAttr(pixelsEl, "PhysicalSizeYUnit") ||
        "µm") as Image["Pixels"]["PhysicalSizeYUnit"],
      PhysicalSizeZUnit: (getAttr(pixelsEl, "PhysicalSizeZUnit") ||
        "µm") as Image["Pixels"]["PhysicalSizeZUnit"],
      Channels: channels,
    },
    format: () => ({
      "Acquisition Date": "",
      "Dimensions (XY)": `${getNumAttr(pixelsEl, "SizeX")} x ${getNumAttr(pixelsEl, "SizeY")}`,
      "Pixels Type": getAttr(pixelsEl, "Type") as Image["Pixels"]["Type"],
      "Pixels Size (XYZ)": "-",
      "Z-sections/Timepoints": `${getNumAttr(pixelsEl, "SizeZ") || 1} x ${getNumAttr(pixelsEl, "SizeT") || 1}`,
      Channels: channels.length,
    }),
  };
}

/**
 * Parse color from OME-XML Color attribute (signed 32-bit integer).
 * Exported for testing.
 */
export function parseColor(
  colorStr: string | null
): [number, number, number, number] | undefined {
  if (!colorStr) return undefined;

  const int = parseInt(colorStr, 10);
  if (isNaN(int)) return undefined;

  // Convert signed 32-bit int to RGBA
  const buffer = new ArrayBuffer(4);
  const view = new DataView(buffer);
  view.setInt32(0, int, false);
  const bytes = new Uint8Array(buffer);
  return [bytes[0], bytes[1], bytes[2], bytes[3]];
}
