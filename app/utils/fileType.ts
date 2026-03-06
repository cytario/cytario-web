import type { icons } from "lucide-react";

export type LucideIconName = keyof typeof icons;

export type FileType =
  | "OME-TIFF"
  | "TIFF"
  | "Parquet"
  | "CSV"
  | "JSON"
  | "PNG"
  | "JPEG"
  | "Directory"
  | "Unknown";

interface FileTypeEntry {
  pattern: RegExp;
  type: FileType;
  icon: LucideIconName;
}

/**
 * Registry of file type patterns, matched top-to-bottom.
 * Order matters: OME-TIFF must precede TIFF so `.ome.tif` matches the specific pattern.
 */
const FILE_TYPE_REGISTRY: FileTypeEntry[] = [
  { pattern: /\.ome\.tiff?$/i, type: "OME-TIFF", icon: "Microscope" },
  { pattern: /\.tiff?$/i, type: "TIFF", icon: "Image" },
  { pattern: /\.parquet$/i, type: "Parquet", icon: "Table" },
  { pattern: /\.csv$/i, type: "CSV", icon: "FileSpreadsheet" },
  { pattern: /\.ndjson$/i, type: "JSON", icon: "Braces" },
  { pattern: /\.json$/i, type: "JSON", icon: "Braces" },
  { pattern: /\.png$/i, type: "PNG", icon: "Image" },
  { pattern: /\.jpe?g$/i, type: "JPEG", icon: "Image" },
];

/** Set of file types that represent viewable images. */
export const IMAGE_FILE_TYPES: ReadonlySet<FileType> = new Set([
  "TIFF",
  "OME-TIFF",
  "PNG",
  "JPEG",
]);

/** Returns a human-readable file type label from a file path or key. */
export function getFileType(path: string): FileType {
  for (const entry of FILE_TYPE_REGISTRY) {
    if (entry.pattern.test(path)) return entry.type;
  }
  return "Unknown";
}

/** Returns a Lucide icon name appropriate for the file's extension. */
export function getFileTypeIcon(path: string): LucideIconName {
  for (const entry of FILE_TYPE_REGISTRY) {
    if (entry.pattern.test(path)) return entry.icon;
  }
  return "File";
}
