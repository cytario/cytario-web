import {
  Archive,
  Braces,
  File,
  FileSpreadsheet,
  Folder,
  Image,
  Microscope,
  Table,
  icons,
  type LucideIcon,
} from "lucide-react";

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
  | "Unknown";

interface FileTypeEntry {
  pattern: RegExp;
  type: FileType;
  label: string;
  icon: LucideIconName;
  iconComponent: LucideIcon;
}

/**
 * Registry of file type patterns, matched top-to-bottom.
 * Order matters: OME-TIFF must precede TIFF so `.ome.tif` matches the specific pattern.
 */
const FILE_TYPE_REGISTRY: FileTypeEntry[] = [
  { pattern: /\.ome\.tiff?$/i, type: "OME-TIFF", label: "OME-TIFF", icon: "Microscope", iconComponent: Microscope },
  { pattern: /\.zarr\/?$/i, type: "OME-Zarr", label: "OME-Zarr", icon: "Microscope", iconComponent: Microscope },
  { pattern: /\.tiff?$/i, type: "TIFF", label: "TIFF", icon: "Image", iconComponent: Image },
  { pattern: /\.parquet$/i, type: "Parquet", label: "Parquet", icon: "Table", iconComponent: Table },
  { pattern: /\.csv$/i, type: "CSV", label: "CSV", icon: "FileSpreadsheet", iconComponent: FileSpreadsheet },
  { pattern: /\.ndjson$/i, type: "JSON", label: "NDJSON", icon: "Braces", iconComponent: Braces },
  { pattern: /\.json$/i, type: "JSON", label: "JSON", icon: "Braces", iconComponent: Braces },
  { pattern: /\.png$/i, type: "PNG", label: "PNG", icon: "Image", iconComponent: Image },
  { pattern: /\.jpe?g$/i, type: "JPEG", label: "JPEG", icon: "Image", iconComponent: Image },
];

/**
 * Extracts the file extension from a filename, handling compound extensions
 * like `.ome.tif`, `.ome.tiff`, and `.zarr`.
 *
 * @example
 * getExtension("sample.ome.tif")  // "ome.tif"
 * getExtension("image.ome.zarr")  // "ome.zarr"
 * getExtension("image.zarr")      // "zarr"
 * getExtension("image.png")       // "png"
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

/** Set of file types that represent viewable images. */
export const IMAGE_FILE_TYPES: ReadonlySet<FileType> = new Set([
  "TIFF",
  "OME-TIFF",
  "OME-Zarr",
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

/** Returns true if the name or key matches a viewable image type. */
export function isImageFile(nameOrKey: string): boolean {
  return IMAGE_FILE_TYPES.has(getFileType(nameOrKey));
}

/** Returns a Lucide icon name appropriate for the file's extension. */
export function getFileTypeIcon(path: string): LucideIconName {
  for (const entry of FILE_TYPE_REGISTRY) {
    if (entry.pattern.test(path)) return entry.icon;
  }
  return "File";
}

/**
 * Returns the appropriate Lucide icon component based on node type
 * (bucket/directory) and file extension.
 */
export function getNodeIcon(node: { type: string; name: string }): LucideIcon {
  if (node.type === "bucket") return Archive;
  if (node.type === "directory") return Folder;

  for (const entry of FILE_TYPE_REGISTRY) {
    if (entry.pattern.test(node.name)) return entry.iconComponent;
  }
  return File;
}

/**
 * Returns a human-readable type label for a node
 * (e.g. "Bucket", "Folder", "OME-TIFF", "OME-Zarr", "CSV").
 * Falls back to the uppercase extension or "File" for unknown types.
 */
export function getTypeLabel(node: { type: string; name: string }): string {
  if (node.type === "bucket") return "Bucket";
  if (node.type === "directory") return "Folder";

  for (const entry of FILE_TYPE_REGISTRY) {
    if (entry.pattern.test(node.name)) return entry.label;
  }

  // Fallback: uppercase extension or "File"
  const lastDot = node.name.lastIndexOf(".");
  if (lastDot === -1) return "File";
  return node.name.slice(lastDot + 1).toUpperCase();
}
