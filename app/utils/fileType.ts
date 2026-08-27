import { iconRegistry, type IconName } from "@cytario/design";

import { formatRegistry } from "~/components/ImageViewer/state/formatRegistry";

export type FileType =
  | "OME-TIFF"
  | "OME-Zarr"
  | "Parquet"
  | "CSV"
  | "JSON"
  | "YAML"
  | "TXT"
  | "Directory"
  | "Unknown"
  | string;

/** Broad rendering category — determines which viewer component handles a file. */
export type FileCategory = "image" | "text" | "tabular" | "none";

interface FileTypeEntry {
  pattern: RegExp;
  type: FileType;
  label: string;
  icon: IconName;
  category: FileCategory;
}

// Matched top-to-bottom — OME-TIFF must precede TIFF so `.ome.tif` hits the
// specific pattern. Built-ins stay hardcoded (not auto-derived from the
// registry) so labels are available during SSR before bootstrap runs.
const STATIC_FILE_TYPES: FileTypeEntry[] = [
  {
    pattern: /\.ome\.tiff?$/i,
    type: "OME-TIFF",
    label: "OME-TIFF",
    icon: "Microscope",
    category: "image",
  },
  {
    pattern: /\.(?:ome\.)?zarr\/?$/i,
    type: "OME-Zarr",
    label: "OME-Zarr",
    icon: "Microscope",
    category: "image",
  },
  {
    pattern: /\.parquet$/i,
    type: "Parquet",
    label: "Parquet",
    icon: "Table",
    category: "tabular",
  },
  {
    pattern: /\.csv$/i,
    type: "CSV",
    label: "CSV",
    icon: "FileSpreadsheet",
    category: "tabular",
  },
  {
    pattern: /\.json$/i,
    type: "JSON",
    label: "JSON",
    icon: "Braces",
    category: "text",
  },
  {
    pattern: /\.(ya?ml)$/i,
    type: "YAML",
    label: "YAML",
    icon: "File",
    category: "text",
  },
  {
    pattern: /\.txt$/i,
    type: "TXT",
    label: "Text",
    icon: "File",
    category: "text",
  },
];

function escapeForRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Trailing slash optional for directory-style URLs (`.zarr/`).
function extensionToPattern(ext: string): RegExp {
  return new RegExp(`\\.${escapeForRegExp(ext)}\\/?$`, "i");
}

// Built-ins filtered out (pluginName === "cytario-web") to avoid doubling up
// with STATIC_FILE_TYPES. Sorted by descending pattern-source length so
// compound extensions outrank plain ones. One FileTypeEntry is emitted per
// key in the registration — array aliases produce N entries sharing the
// same label/icon; regex keys are used directly as the pattern.
function pluginFileTypes(): FileTypeEntry[] {
  const entries: FileTypeEntry[] = [];
  for (const { keys, handler, pluginName } of formatRegistry.list()) {
    if (pluginName === "cytario-web") continue;
    const label = handler.fileTypeMeta?.label ?? pluginName;
    const iconName = handler.fileTypeMeta?.icon ?? "Image";
    const icon: IconName = iconName in iconRegistry ? (iconName as IconName) : "Image";
    for (const key of keys) {
      entries.push({
        pattern: typeof key === "string" ? extensionToPattern(key) : key,
        type: label,
        label,
        icon,
        category: "image",
      });
    }
  }
  return entries.sort((a, b) => b.pattern.source.length - a.pattern.source.length);
}

// Plugin entries first so a plugin can shadow a static type for the same
// extension (rare but supported).
export function allFileTypes(): FileTypeEntry[] {
  return [...pluginFileTypes(), ...STATIC_FILE_TYPES];
}

/**
 * Handles compound extensions (`.ome.tif`, `.ome.zarr`).
 *
 * @example
 * getExtension("sample.ome.tif")  // "ome.tif"
 * getExtension("image.zarr")      // "zarr"
 * getExtension("README")          // undefined
 */
export function getExtension(name: string): string | undefined {
  const lower = name.toLowerCase();
  if (lower.endsWith(".ome.tif")) return "ome.tif";
  if (lower.endsWith(".ome.tiff")) return "ome.tiff";
  if (lower.endsWith(".ome.zarr")) return "ome.zarr";
  const lastDot = lower.lastIndexOf(".");
  if (lastDot <= 0) return undefined;
  return lower.slice(lastDot + 1);
}

/**
 * Strips the query string and fragment from a path/URL, returning just the
 * path portion. Signed URLs carry `?` query params (e.g. `foo.ext?sig=abc`),
 * which break extension-suffix matching (`\.ext$`) and resolve to "Unknown" —
 * strip them before any extension/type detection.
 *
 * @example
 * stripUrlSuffix("s3://b/slide.ome.tif?X-Amz-Signature=abc") // "s3://b/slide.ome.tif"
 * stripUrlSuffix("data/slide.png#thumb")                     // "data/slide.png"
 */
export function stripUrlSuffix(path: string): string {
  const queryIdx = path.indexOf("?");
  const hashIdx = path.indexOf("#");
  let end = path.length;
  if (queryIdx !== -1) end = Math.min(end, queryIdx);
  if (hashIdx !== -1) end = Math.min(end, hashIdx);
  return path.slice(0, end);
}

/** Returns the first matching {@link FileTypeEntry} for a file path or key. */
export function getFileTypeEntry(nameOrKey: string): FileTypeEntry | undefined {
  const cleaned = stripUrlSuffix(nameOrKey);
  return allFileTypes().find((entry) => entry.pattern.test(cleaned));
}

/** Returns a human-readable file type label from a file path or key. */
export function getFileType(path: string): FileType {
  return getFileTypeEntry(path)?.type ?? "Unknown";
}

/** Returns the rendering category for a file path or key. */
export function getFileCategory(nameOrKey: string): FileCategory {
  return getFileTypeEntry(nameOrKey)?.category ?? "none";
}

/** Returns true if the file can be downloaded via the context menu. */
export function isDownloadable(nameOrKey: string): boolean {
  return getFileCategory(nameOrKey) === "text";
}

export type { FileTypeEntry };
