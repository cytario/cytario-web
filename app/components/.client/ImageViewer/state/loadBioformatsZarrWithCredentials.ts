import type { Credentials } from "@aws-sdk/client-sts";
import { loadOmeZarrFromStore, type RootAttrs } from "@hms-dbmi/viv";

import { CredentialedHTTPStore } from "./CredentialedHTTPStore";
import type { Image, Loader } from "./ome.tif.types";
import type { BucketConfig } from "~/.generated/client";

interface LoadOptions {
  credentials: Credentials;
  bucketConfig?: BucketConfig;
}

/**
 * Load an OME-Zarr image using AWS credentials for S3 authentication.
 * Uses viv's loadOmeZarrFromStore with a custom credentialed store.
 */
export async function loadBioformatsZarrWithCredentials(
  source: string,
  options: LoadOptions,
): Promise<{ data: Loader; metadata: Image }> {
  const { credentials, bucketConfig } = options;
  const baseUrl = source.endsWith("/") ? source.slice(0, -1) : source;

  // Point store at image series 0 — bioformats2raw puts multiscales metadata
  // under 0/, not at the root (which only has bioformats2raw.layout).
  const store = new CredentialedHTTPStore(`${baseUrl}/0`, credentials, bucketConfig);
  const result = await loadOmeZarrFromStore(store);

  const loader = result.data as Loader;

  return {
    data: loader,
    metadata: rootAttrsToImage(result.metadata, loader),
  };
}

/**
 * NGFF coordinate transformation (not typed in viv's RootAttrs but present at runtime).
 */
interface CoordinateTransformation {
  type: "scale" | "translation";
  scale?: number[];
  translation?: number[];
}

interface DatasetWithTransforms {
  path: string;
  coordinateTransformations?: CoordinateTransformation[];
}

/**
 * Map NGFF RootAttrs metadata to the OME-TIFF Image type
 * used by downstream consumers (getInitialChannelsState, etc.).
 * Exported for testing.
 */
export function rootAttrsToImage(rootAttrs: RootAttrs, loader: Loader): Image {
  const { omero, multiscales } = rootAttrs;
  const multiscale = multiscales[0];
  const axes = multiscale?.axes ?? [];
  const channels = omero?.channels ?? [];

  // Get image dimensions from the first resolution level's shape
  const shape = loader[0]?.shape ?? [];
  const labels = loader[0]?.labels ?? [];
  const dimIndex = (name: string) => labels.indexOf(name);

  const SizeX = shape[dimIndex("x")] ?? 0;
  const SizeY = shape[dimIndex("y")] ?? 0;
  const SizeZ = shape[dimIndex("z")] ?? 1;
  const SizeT = shape[dimIndex("t")] ?? 1;
  const SizeC = shape[dimIndex("c")] ?? (channels.length || 1);

  // Extract physical pixel sizes from NGFF coordinateTransformations.
  // The first dataset's scale transform maps pixel indices to physical units.
  const { PhysicalSizeX, PhysicalSizeY, PhysicalSizeZ } =
    extractPhysicalSizes(multiscale, axes);

  // Resolve axis units (NGFF stores unit on the axis definition)
  const axisUnit = (name: string) => {
    const axis = axes.find(
      (a): a is { name: string; unit?: string } =>
        typeof a !== "string" && a.name === name,
    );
    return axis?.unit ?? "µm";
  };

  return {
    ID: "Image:0",
    Name: omero?.name,
    AquisitionDate: "",
    Pixels: {
      ID: "Pixels:0",
      DimensionOrder: "XYZCT",
      Type: "uint16",
      SizeT,
      SizeC,
      SizeZ,
      SizeY,
      SizeX,
      PhysicalSizeX,
      PhysicalSizeY,
      PhysicalSizeZ,
      PhysicalSizeXUnit: axisUnit("x"),
      PhysicalSizeYUnit: axisUnit("y"),
      PhysicalSizeZUnit: axisUnit("z"),
      Channels: channels.map((ch, i) => ({
        ID: `Channel:0:${i}`,
        Name: ch.label,
        Color: parseOmeroColor(ch.color),
      })),
    },
    format: () => ({
      "Acquisition Date": "",
      "Dimensions (XY)": `${SizeX} x ${SizeY}`,
      "Pixels Type": "uint16",
      "Pixels Size (XYZ)": PhysicalSizeX
        ? `${PhysicalSizeX} x ${PhysicalSizeY} ${axisUnit("x")}`
        : "-",
      "Z-sections/Timepoints": `${SizeZ} x ${SizeT}`,
      Channels: channels.length,
    }),
  } as Image;
}

/**
 * Extract physical pixel sizes from NGFF coordinateTransformations on the first dataset.
 * The scale transform values correspond to axes in order.
 * Exported for testing.
 */
export function extractPhysicalSizes(
  multiscale: RootAttrs["multiscales"][0] | undefined,
  axes: RootAttrs["multiscales"][0]["axes"],
) {
  const datasets = (multiscale?.datasets ?? []) as DatasetWithTransforms[];
  const firstDataset = datasets[0];
  const scaleTransform = firstDataset?.coordinateTransformations?.find(
    (t) => t.type === "scale",
  );

  if (!scaleTransform?.scale || !axes) {
    return {};
  }

  const resolvedAxes =
    axes.map((a) => (typeof a === "string" ? a : a.name)) ?? [];

  const scaleForAxis = (name: string): number | undefined => {
    const idx = resolvedAxes.indexOf(name);
    return idx >= 0 ? scaleTransform.scale![idx] : undefined;
  };

  return {
    PhysicalSizeX: scaleForAxis("x"),
    PhysicalSizeY: scaleForAxis("y"),
    PhysicalSizeZ: scaleForAxis("z"),
  };
}

/**
 * Parse omero channel color string to RGBA tuple.
 * Omero colors are hex strings like "FF0000" (RGB) or "FF0000FF" (RGBA).
 * Exported for testing.
 */
export function parseOmeroColor(
  color: string,
): [number, number, number, number] | undefined {
  if (!color) return undefined;

  const hex = color.replace(/^#/, "");
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const a = hex.length >= 8 ? parseInt(hex.slice(6, 8), 16) : 255;

  if (isNaN(r) || isNaN(g) || isNaN(b)) return undefined;
  return [r, g, b, a];
}
