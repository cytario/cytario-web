import { iconRegistry, type IconName } from "@cytario/design";

import type { CompanionDirNaming } from "@cytario/plugin-api";
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
export type FileCategory = "image" | "text" | "tabular" | "document" | "none";

interface FileTypeEntry {
  pattern: RegExp;
  type: FileType;
  label: string;
  icon: IconName;
  category: FileCategory;
  /** `leaf`: the prefix is the image. `companion`: hide the same-named sibling dir. */
  storageLayout?: StorageLayout;
  /** Companion-dir naming convention. Default `"same-name"`. */
  companionDir?: CompanionDirNaming;
}

export type StorageLayout = "leaf" | "companion";

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
    storageLayout: "leaf",
  },
  {
    pattern: /\.mrxs$/i,
    type: "MRXS",
    label: "MRXS",
    icon: "Microscope",
    category: "none",
    storageLayout: "companion",
  },
  {
    pattern: /\.vsi$/i,
    type: "VSI",
    label: "VSI",
    icon: "Microscope",
    category: "none",
    storageLayout: "companion",
    companionDir: "underscore-wrapped",
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
    pattern: /\.pdf$/i,
    type: "PDF",
    label: "PDF",
    icon: "ScrollText",
    category: "document",
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
        ...(handler.fileTypeMeta?.storageLayout
          ? {
              storageLayout: handler.fileTypeMeta.storageLayout,
              ...(handler.fileTypeMeta.companionDir
                ? { companionDir: handler.fileTypeMeta.companionDir }
                : {}),
            }
          : {}),
      });
    }
  }
  return entries.sort((a, b) => b.pattern.source.length - a.pattern.source.length);
}

// Plugin entries first so a plugin can shadow a static type for the same
// extension (rare but supported). Memoized — formatRegistry doesn't change
// after bootstrap.
let _allFileTypes: FileTypeEntry[] | undefined;
export function allFileTypes(): FileTypeEntry[] {
  if (_allFileTypes) return _allFileTypes;
  _allFileTypes = [...pluginFileTypes(), ...STATIC_FILE_TYPES];
  return _allFileTypes;
}

/** Test-only: clears the memoized file-type list so registry changes are picked up. */
export function __resetFileTypeCache(): void {
  _allFileTypes = undefined;
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

/**
 * Returns the first matching {@link FileTypeEntry} for a file path or key.
 * A plugin entry that shadows a static entry but omits `storageLayout`
 * inherits it from the static one, so layout semantics survive plugin
 * injection; an explicit plugin value always wins.
 */
export function getFileTypeEntry(nameOrKey: string): FileTypeEntry | undefined {
  const cleaned = stripUrlSuffix(nameOrKey);
  const entry = allFileTypes().find((e) => e.pattern.test(cleaned));
  if (!entry || entry.storageLayout) return entry;
  const fallback = STATIC_FILE_TYPES.find((e) => e.storageLayout && e.pattern.test(cleaned));
  return fallback
    ? { ...entry, storageLayout: fallback.storageLayout, companionDir: fallback.companionDir }
    : entry;
}

/** Returns a human-readable file type label from a file path or key. */
export function getFileType(path: string): FileType {
  return getFileTypeEntry(path)?.type ?? "Unknown";
}

/** Returns the rendering category for a file path or key. */
export function getFileCategory(nameOrKey: string): FileCategory {
  return getFileTypeEntry(nameOrKey)?.category ?? "none";
}

export type { FileTypeEntry };
