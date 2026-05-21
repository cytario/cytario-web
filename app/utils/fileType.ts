import {
  Braces,
  FileSpreadsheet,
  Image,
  Microscope,
  Table,
  icons,
  type LucideIcon,
} from "lucide-react";

import { formatRegistry } from "~/components/ImageViewer/state/formatRegistry";

export type { LucideIcon };
export type LucideIconName = keyof typeof icons;

export type FileType =
  | "OME-TIFF"
  | "OME-Zarr"
  | "TIFF"
  | "Parquet"
  | "CSV"
  | "JSON"
  | "PNG"
  | "JPEG"
  | "Directory"
  | "Unknown"
  | string;

interface FileTypeEntry {
  pattern: RegExp;
  type: FileType;
  label: string;
  icon: LucideIconName;
  iconComponent: LucideIcon;
  isImage: boolean;
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
    iconComponent: Microscope,
    isImage: true,
  },
  {
    pattern: /\.ome\.zarr\/?$/i,
    type: "OME-Zarr",
    label: "OME-Zarr",
    icon: "Microscope",
    iconComponent: Microscope,
    isImage: true,
  },
  {
    pattern: /\.zarr\/?$/i,
    type: "OME-Zarr",
    label: "OME-Zarr",
    icon: "Microscope",
    iconComponent: Microscope,
    isImage: true,
  },
  {
    pattern: /\.tiff?$/i,
    type: "TIFF",
    label: "TIFF",
    icon: "Image",
    iconComponent: Image,
    isImage: true,
  },
  {
    pattern: /\.parquet$/i,
    type: "Parquet",
    label: "Parquet",
    icon: "Table",
    iconComponent: Table,
    isImage: false,
  },
  {
    pattern: /\.csv$/i,
    type: "CSV",
    label: "CSV",
    icon: "FileSpreadsheet",
    iconComponent: FileSpreadsheet,
    isImage: false,
  },
  {
    pattern: /\.ndjson$/i,
    type: "JSON",
    label: "NDJSON",
    icon: "Braces",
    iconComponent: Braces,
    isImage: false,
  },
  {
    pattern: /\.json$/i,
    type: "JSON",
    label: "JSON",
    icon: "Braces",
    iconComponent: Braces,
    isImage: false,
  },
  {
    pattern: /\.png$/i,
    type: "PNG",
    label: "PNG",
    icon: "Image",
    iconComponent: Image,
    isImage: true,
  },
  {
    pattern: /\.jpe?g$/i,
    type: "JPEG",
    label: "JPEG",
    icon: "Image",
    iconComponent: Image,
    isImage: true,
  },
];

function escapeForRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Trailing slash optional for directory-style URLs (`.zarr/`).
function extensionToPattern(ext: string): RegExp {
  return new RegExp(`\\.${escapeForRegExp(ext)}\\/?$`, "i");
}

function resolveLucideIcon(name: string | undefined): LucideIcon {
  if (!name) return Image;
  const lookup = (icons as Record<string, LucideIcon>)[name];
  return lookup ?? Image;
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
    const iconComponent = resolveLucideIcon(iconName);
    for (const key of keys) {
      entries.push({
        pattern: typeof key === "string" ? extensionToPattern(key) : key,
        type: label,
        label,
        icon: iconName as LucideIconName,
        iconComponent,
        isImage: true,
      });
    }
  }
  return entries.sort((a, b) => b.pattern.source.length - a.pattern.source.length);
}

// Plugin entries first so a plugin can shadow a static type for the same
// extension (rare but supported).
function allFileTypes(): FileTypeEntry[] {
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

// Signed URLs carry `?` query params; without stripping, `foo.ext?sig=abc`
// fails the `\.ext/?$` pattern and resolves to "Unknown".
function stripUrlSuffix(path: string): string {
  const queryIdx = path.indexOf("?");
  const hashIdx = path.indexOf("#");
  let end = path.length;
  if (queryIdx !== -1) end = Math.min(end, queryIdx);
  if (hashIdx !== -1) end = Math.min(end, hashIdx);
  return path.slice(0, end);
}

/** Returns a human-readable file type label from a file path or key. */
export function getFileType(path: string): FileType {
  const cleaned = stripUrlSuffix(path);
  for (const entry of allFileTypes()) {
    if (entry.pattern.test(cleaned)) return entry.type;
  }
  return "Unknown";
}

/** Returns true if the name or key matches a viewable image type. */
export function isImageFile(nameOrKey: string): boolean {
  const cleaned = stripUrlSuffix(nameOrKey);
  for (const entry of allFileTypes()) {
    if (entry.pattern.test(cleaned)) return entry.isImage;
  }
  return false;
}

/** Returns a Lucide icon name appropriate for the file's extension. */
export function getFileTypeIcon(path: string): LucideIconName {
  const cleaned = stripUrlSuffix(path);
  for (const entry of allFileTypes()) {
    if (entry.pattern.test(cleaned)) return entry.icon;
  }
  return "File";
}
