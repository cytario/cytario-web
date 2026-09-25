import type { RootAttrs } from "@hms-dbmi/viv";

import { rootAttrsToImage } from "./loadBioformatsZarrWithCredentials";
import type { Image } from "../store/core/ome.tif.types";
import type { LoadOptions } from "@cytario/plugin-api";
interface ZarrayMeta {
  shape?: number[];
  chunks?: number[];
  dtype?: string;
}

/**
 * `.zarray` dtypes are NumPy-style (e.g. `<u2`, `>i4`); the mapper expects
 * zarrita's plain form (e.g. `uint16`).
 */
function normalizeZarrDtype(dtype: string): string {
  const match = /^[<>|]?(u1|u2|u4|u8|i1|i2|i4|i8|f4|f8)/.exec(dtype);
  if (!match) return dtype;
  const code = match[1];
  const numpyTypes: Record<string, string> = {
    u1: "uint8",
    i1: "int8",
    u2: "uint16",
    i2: "int16",
    u4: "uint32",
    i4: "int32",
    u8: "uint64",
    i8: "int64",
    f4: "float32",
    f8: "float64",
  };
  return numpyTypes[code] ?? dtype;
}

/**
 * Metadata-only read of a bioformats2raw OME-Zarr: three small JSON GETs —
 * `/0/.zarray` (base-resolution shape + dtype), `/0/.zattrs` (series
 * multiscales axes), and the root `.zattrs` (omero channels) — then the same
 * `rootAttrsToImage` mapper the full load uses. No chunk data is read.
 */
export async function readOmeZarrCharacteristics(
  source: string,
  opts: LoadOptions,
): Promise<Image> {
  const { signedFetch, headers } = opts;
  const baseUrl = source.endsWith("/") ? source.slice(0, -1) : source;

  const fetchJson = async (url: string): Promise<unknown | undefined> => {
    const response = await signedFetch(url, { headers });
    if (response.status === 404) return undefined;
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} fetching ${url}`);
    }
    return response.json();
  };

  const seriesAttrs = (await fetchJson(`${baseUrl}/0/.zattrs`)) as
    { multiscales?: RootAttrs["multiscales"] } | undefined;
  const zarray = (await fetchJson(`${baseUrl}/0/.zarray`)) as ZarrayMeta | undefined;
  const rootAttrs = (await fetchJson(`${baseUrl}/.zattrs`)) as RootAttrs | undefined;
  if (!zarray?.shape || !zarray.dtype) {
    throw new Error("OME-Zarr base resolution has no .zarray shape/dtype");
  }

  const multiscales = rootAttrs?.multiscales ?? seriesAttrs?.multiscales;
  if (!multiscales?.length) {
    throw new Error("OME-Zarr has no multiscales metadata");
  }
  const axes = multiscales[0].axes ?? [];

  // bioformats2raw always writes XYZCT-ordered shape arrays; the labels come
  // from the multiscale axes, matching viv's `loadMultiscales`.
  const axesNames = axes.map((axis) => (typeof axis === "string" ? axis : axis.name));

  return rootAttrsToImage({ omero: rootAttrs?.omero, multiscales } as RootAttrs, {
    shape: zarray.shape,
    labels: axesNames,
    dtype: zarray.dtype ? normalizeZarrDtype(zarray.dtype) : "",
  });
}
