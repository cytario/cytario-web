import { loadBioformatsZarrWithCredentials } from "../loaders/loadBioformatsZarrWithCredentials";
import { loadOmeTiffWithCredentials } from "../loaders/loadOmeTiffWithCredentials";
import type { LoadOptions } from "@cytario/plugin-api";
import { formatRegistry } from "~/components/ImageViewer/state/formatRegistry";
import { isZarrPath } from "~/utils/zarrUtils";

let registered = false;

/**
 * Register OME-TIFF and OME-Zarr as built-in format handlers. Idempotent —
 * safe to call multiple times (e.g. from both server and client entry
 * points, and from HMR re-execution).
 */
export function registerBuiltinFormats(): void {
  if (registered) return;
  registered = true;

  formatRegistry.add("cytario-web", "ome.tif", {
    match: (url) => /\.ome\.tiff?$/i.test(url),
    load: (url: string, opts: LoadOptions) => loadOmeTiffWithCredentials(url, opts),
    fileTypeMeta: { label: "OME-TIFF", icon: "Microscope" },
  });

  formatRegistry.add("cytario-web", "ome.zarr", {
    match: (url) => isZarrPath(url),
    load: (url: string, opts: LoadOptions) => loadBioformatsZarrWithCredentials(url, opts),
    fileTypeMeta: { label: "OME-Zarr", icon: "Microscope" },
  });
}

/** Test-only: re-enable registration after `formatRegistry.__reset()`. */
export function __resetBuiltinFormats(): void {
  registered = false;
}
