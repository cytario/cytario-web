import {
  Archive,
  File,
  FileSpreadsheet,
  Folder,
  Image,
  Microscope,
  type LucideIcon,
} from "lucide-react";

import { type TreeNode } from "./buildDirectoryTree";

/**
 * Returns the appropriate Lucide icon for a given tree node based on its
 * type and file extension.
 */
export function getFileIcon(node: TreeNode): LucideIcon {
  if (node.type === "bucket") return Archive;
  if (node.type === "directory") return Folder;

  const ext = getExtension(node.name);
  if (ext === "ome.tif" || ext === "ome.tiff") return Microscope;
  if (/^(tiff?|png|jpe?g|gif|bmp|webp|svg)$/.test(ext)) return Image;
  if (/^(csv|parquet|json|ndjson|tsv|xlsx?)$/.test(ext))
    return FileSpreadsheet;
  return File;
}

/**
 * Returns a human-readable type label for a tree node.
 */
export function getTypeLabel(node: TreeNode): string {
  if (node.type === "bucket") return "Bucket";
  if (node.type === "directory") return "Folder";

  const ext = getExtension(node.name);
  if (ext === "ome.tif" || ext === "ome.tiff") return "OME-TIFF";
  if (/^tiff?$/.test(ext)) return "TIFF";
  if (ext === "csv") return "CSV";
  if (ext === "parquet") return "Parquet";
  if (ext === "png") return "PNG";
  if (/^jpe?g$/.test(ext)) return "JPEG";
  if (ext === "json") return "JSON";
  if (ext === "ndjson") return "NDJSON";
  return ext ? ext.toUpperCase() : "File";
}

/**
 * Extracts the file extension from a filename. Handles compound extensions
 * like `.ome.tif` and `.ome.tiff`.
 */
function getExtension(name: string): string {
  const lower = name.toLowerCase();
  // Check for compound OME-TIFF extension first
  if (lower.endsWith(".ome.tif")) return "ome.tif";
  if (lower.endsWith(".ome.tiff")) return "ome.tiff";
  const lastDot = lower.lastIndexOf(".");
  if (lastDot === -1) return "";
  return lower.slice(lastDot + 1);
}
