import { loadOmeZarrFromStore, type RootAttrs } from "@hms-dbmi/viv";

import type { Image, Loader } from "../store/ome.tif.types";
import { CredentialedHTTPStore } from "../transport/CredentialedHTTPStore";
import { normalizePixelType } from "@cytario/plugin-api";
import type { LoadOptions } from "@cytario/plugin-api";

/**
 * Load OME-Zarr via SigV4-signed S3 requests. `signal` is best-effort —
 * viv's loader does not surface AbortSignal yet.
 */
export async function loadBioformatsZarrWithCredentials(
  source: string,
  opts: LoadOptions,
): Promise<{ data: Loader; metadata: Image }> {
  const { signedFetch } = opts;
  const baseUrl = source.endsWith("/") ? source.slice(0, -1) : source;

  // Series 0 — bioformats2raw puts multiscales under 0/; root has only
  // bioformats2raw.layout.
  const store = new CredentialedHTTPStore(`${baseUrl}/0`, signedFetch);
  const result = await loadOmeZarrFromStore(store);

  const loader = result.data as Loader;

  return {
    data: loader,
    metadata: rootAttrsToImage(result.metadata, loader),
  };
}

// Present in NGFF runtime metadata, not typed in viv's RootAttrs.
interface CoordinateTransformation {
  type: "scale" | "translation";
  scale?: number[];
  translation?: number[];
}

interface DatasetWithTransforms {
  path: string;
  coordinateTransformations?: CoordinateTransformation[];
}

/** Map NGFF RootAttrs → OME-TIFF Image. Exported for testing. */
export function rootAttrsToImage(rootAttrs: RootAttrs, loader: Loader): Image {
  const { omero, multiscales } = rootAttrs;
  const multiscale = multiscales[0];
  const axes = multiscale?.axes ?? [];
  const channels = omero?.channels ?? [];

  const shape = loader[0]?.shape ?? [];
  const labels = loader[0]?.labels ?? [];
  const dimIndex = (name: string) => labels.indexOf(name);

  const SizeX = shape[dimIndex("x")] ?? 0;
  const SizeY = shape[dimIndex("y")] ?? 0;
  const SizeZ = shape[dimIndex("z")] ?? 1;
  const SizeT = shape[dimIndex("t")] ?? 1;
  const SizeC = shape[dimIndex("c")] ?? (channels.length || 1);

  const { PhysicalSizeX, PhysicalSizeY, PhysicalSizeZ } = extractPhysicalSizes(
    multiscale,
    axes,
  );

  const axisUnit = (name: string) => {
    const axis = axes.find(
      (a): a is { name: string; unit?: string } =>
        typeof a !== "string" && a.name === name,
    );
    return axis?.unit ?? "µm";
  };

  // Zarrita yields lower-case dtype; PixelType union is canonical casing.
  const pixelType = normalizePixelType(loader[0]?.dtype ?? "uint16");

  return {
    ID: "Image:0",
    Name: omero?.name,
    AcquisitionDate: "",
    Pixels: {
      ID: "Pixels:0",
      DimensionOrder: "XYZCT",
      Type: pixelType,
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
      Channels: channels.map(
        (ch: { label: string; color: string }, i: number) => ({
          ID: `Channel:0:${i}`,
          Name: ch.label,
          Color: parseOmeroColor(ch.color),
        }),
      ),
    },
  } as Image;
}

/** Exported for testing. */
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
    axes.map((a: string | { name: string }) =>
      typeof a === "string" ? a : a.name,
    ) ?? [];

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
 * Omero colors are hex strings — "FF0000" (RGB) or "FF0000FF" (RGBA).
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
