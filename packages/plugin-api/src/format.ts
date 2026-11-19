import type { Image, Loader } from "./image";

export type SignedFetch = (url: string, init?: RequestInit) => Promise<Response>;

/** A locally-opened file handed to a handler in place of the URL source. */
export type LocalFileSource = File | Blob;

export interface LoadOptions {
  signedFetch: SignedFetch;
  signal?: AbortSignal;
  headers?: Record<string, string>;
  offsets?: number[];
  /**
   * Local file source for a browser-opened file. When present, the handler
   * reads the image from this File/Blob (slicing on demand) instead of the
   * URL and must not issue network requests for the source; `signedFetch` is
   * a host-supplied stub that throws if called. Handlers that cannot read
   * from a Blob source declare that by omitting `supportsLocalSource`.
   */
  source?: LocalFileSource;
}

export interface FileTypeMeta {
  label?: string;
  icon?: string;
  /** `leaf`: the prefix is the image (.zarr). `companion`: hide the same-named sibling dir (.mrxs). */
  storageLayout?: StorageLayout;
  /**
   * Companion-dir naming convention.
   * `"same-name"` (default): `slide.mrxs` → `slide/`.
   * `"underscore-wrapped"`: `OS-1.vsi` → `_OS-1_/`.
   */
  companionDir?: CompanionDirNaming;
}

export type StorageLayout = "leaf" | "companion";

export type CompanionDirNaming = "same-name" | "underscore-wrapped";

/**
 * Extension declaration shape for a `FormatHandler`. Accepts:
 *
 *  - a string, e.g. `"czi"` — treated as a literal extension suffix after
 *    stripping a leading dot and lowercasing;
 *  - an array of strings, e.g. `["ome.tif", "ome.tiff"]` — multiple
 *    aliases bound to the same handler;
 *  - a regular expression tested against the URL, e.g.
 *    `/\.zarr(\/|$|\?)/` — for cases suffix matching cannot express
 *    (vendor schemes, signed URLs without an extension, refining within
 *    an existing extension class).
 *
 * Collision detection runs against normalized string keys and against
 * `regex.source + regex.flags` for regex keys. Two registrations whose
 * regex texts differ but whose URL coverage overlaps are NOT detected.
 */
export type FormatExtension = string | string[] | RegExp;

export interface FormatHandler {
  load(url: string, opts: LoadOptions): Promise<{ data: Loader; metadata: Image }>;
  fileTypeMeta?: FileTypeMeta;
  /**
   * Whether `load` can read from `LoadOptions.source` (a local File/Blob).
   * Absent means the handler only reads the URL source; the host does not
   * claim such handlers for local opens.
   */
  supportsLocalSource?: boolean;
}

export interface FormatRegistry {
  register(extension: FormatExtension, handler: FormatHandler): void;
}
