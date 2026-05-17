import {
  Archive,
  Braces,
  File,
  FileSpreadsheet,
  Folder,
  Image,
  Microscope,
  Table,
} from "lucide-react";
import { describe, expect, test } from "vitest";

import { getFileType, getFileTypeIcon, getNodeIcon, getTypeLabel, isImageFile } from "../fileType";
import { TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { formatRegistry } from "~/components/ImageViewer/state/formatRegistry";

function makeNode(overrides: Partial<TreeNode> = {}): TreeNode {
  return {
    id: "test",
    connectionName: "aws-bucket",
    name: "test",
    type: "file",
    pathName: "test",
    children: [],
    ...overrides,
  };
}

describe("getFileType", () => {
  test("identifies OME-TIFF files (takes precedence over TIFF)", () => {
    expect(getFileType("image.ome.tiff")).toBe("OME-TIFF");
    expect(getFileType("image.ome.tif")).toBe("OME-TIFF");
    expect(getFileType("IMAGE.OME.TIFF")).toBe("OME-TIFF");
  });

  test("identifies TIFF files", () => {
    expect(getFileType("photo.tiff")).toBe("TIFF");
    expect(getFileType("photo.tif")).toBe("TIFF");
  });

  test("identifies Parquet files", () => {
    expect(getFileType("data.parquet")).toBe("Parquet");
    expect(getFileType("DATA.PARQUET")).toBe("Parquet");
  });

  test("identifies CSV files", () => {
    expect(getFileType("table.csv")).toBe("CSV");
  });

  test("identifies JSON and NDJSON files", () => {
    expect(getFileType("config.json")).toBe("JSON");
    expect(getFileType("stream.ndjson")).toBe("JSON");
  });

  test("identifies image files", () => {
    expect(getFileType("photo.png")).toBe("PNG");
    expect(getFileType("photo.jpg")).toBe("JPEG");
    expect(getFileType("photo.jpeg")).toBe("JPEG");
  });

  test("returns Unknown for unrecognized extensions", () => {
    expect(getFileType("file.xyz")).toBe("Unknown");
    expect(getFileType("readme.md")).toBe("Unknown");
  });

  test("returns Unknown for empty string", () => {
    expect(getFileType("")).toBe("Unknown");
  });

  test("returns Unknown for files without extension", () => {
    expect(getFileType("Makefile")).toBe("Unknown");
  });
});

describe("isImageFile", () => {
  test("returns true for image types", () => {
    expect(isImageFile("photo.tiff")).toBe(true);
    expect(isImageFile("image.ome.tiff")).toBe(true);
    expect(isImageFile("image.ome.zarr")).toBe(true);
    expect(isImageFile("image.zarr")).toBe(true);
    expect(isImageFile("photo.png")).toBe(true);
    expect(isImageFile("photo.jpg")).toBe(true);
  });

  test("returns false for non-image types", () => {
    expect(isImageFile("table.csv")).toBe(false);
    expect(isImageFile("data.parquet")).toBe(false);
    expect(isImageFile("config.json")).toBe(false);
    expect(isImageFile("unknown.xyz")).toBe(false);
    expect(isImageFile("Makefile")).toBe(false);
  });
});

describe("plugin-derived file types", () => {
  beforeEach(() => {
    formatRegistry.__reset();
  });

  test("auto-derives label from plugin name when fileTypeMeta is absent", () => {
    formatRegistry.add("my-plugin", "xyz", {
      load: async () => ({ data: [], metadata: {} as never }),
    });
    expect(getFileType("file.xyz")).toBe("my-plugin");
    expect(getFileTypeIcon("file.xyz")).toBe("Image");
    expect(isImageFile("file.xyz")).toBe(true);
  });

  test("uses fileTypeMeta.label and fileTypeMeta.icon when provided", () => {
    formatRegistry.add("vendor-plugin", "abc", {
      load: async () => ({ data: [], metadata: {} as never }),
      fileTypeMeta: { label: "Vendor Format", icon: "Microscope" },
    });
    expect(getFileType("sample.abc")).toBe("Vendor Format");
    expect(getFileTypeIcon("sample.abc")).toBe("Microscope");
  });

  test("plugin entries do not shadow built-in OME-TIFF/OME-Zarr (built-ins stay in STATIC_FILE_TYPES)", () => {
    // Built-ins (cytario-web) are excluded from plugin-derived entries; the
    // hardcoded STATIC_FILE_TYPES still owns the OME-TIFF / OME-Zarr labels
    // — proven by the existing test cases above which never depend on the
    // registry being bootstrapped.
    expect(getFileType("image.ome.tif")).toBe("OME-TIFF");
    expect(getFileType("image.zarr")).toBe("OME-Zarr");
  });
});

describe("zarr trailing-slash and compound extensions", () => {
  test("trailing-slash zarr URLs resolve to OME-Zarr", () => {
    expect(getFileType("image.zarr/")).toBe("OME-Zarr");
    expect(getFileType("image.ome.zarr/")).toBe("OME-Zarr");
  });

  test(".ome.tiff resolves to OME-TIFF, not TIFF", () => {
    expect(getFileType("image.ome.tiff")).toBe("OME-TIFF");
  });
});

describe("query-string and fragment handling", () => {
  test("presigned URLs (?sig=...) resolve to the correct type", () => {
    expect(getFileType("image.ome.tif?sig=abc&exp=123")).toBe("OME-TIFF");
    expect(getFileType("photo.png?cache=bust")).toBe("PNG");
    expect(getFileType("data.parquet?range=0-1024")).toBe("Parquet");
  });

  test("URL fragments (#frag) are stripped before matching", () => {
    expect(getFileType("image.ome.tif#region-1")).toBe("OME-TIFF");
  });

  test("isImageFile honours query-stripped extension", () => {
    expect(isImageFile("photo.jpg?expires=tomorrow")).toBe(true);
    expect(isImageFile("data.csv?range=0-100")).toBe(false);
  });

  test("getTypeLabel fallback strips suffix before uppercase", () => {
    expect(getTypeLabel(makeNode({ name: "weird.xyz?sig=abc" }))).toBe("XYZ");
  });
});

describe("getFileTypeIcon", () => {
  test("returns Microscope for OME-TIFF", () => {
    expect(getFileTypeIcon("image.ome.tiff")).toBe("Microscope");
  });

  test("returns Image for TIFF and image formats", () => {
    expect(getFileTypeIcon("photo.tiff")).toBe("Image");
    expect(getFileTypeIcon("photo.png")).toBe("Image");
    expect(getFileTypeIcon("photo.jpg")).toBe("Image");
  });

  test("returns Table for Parquet", () => {
    expect(getFileTypeIcon("data.parquet")).toBe("Table");
  });

  test("returns File for unknown types", () => {
    expect(getFileTypeIcon("unknown.xyz")).toBe("File");
    expect(getFileTypeIcon("")).toBe("File");
  });
});

describe("getNodeIcon", () => {
  test("returns Archive for bucket nodes", () => {
    expect(getNodeIcon(makeNode({ type: "bucket" }))).toBe(Archive);
  });

  test("returns Folder for directory nodes", () => {
    expect(getNodeIcon(makeNode({ type: "directory" }))).toBe(Folder);
  });

  test("returns Microscope for .ome.tif files", () => {
    expect(getNodeIcon(makeNode({ name: "sample.ome.tif" }))).toBe(Microscope);
  });

  test("returns Microscope for .ome.tiff files", () => {
    expect(getNodeIcon(makeNode({ name: "sample.ome.tiff" }))).toBe(Microscope);
  });

  test("returns Image for .png files", () => {
    expect(getNodeIcon(makeNode({ name: "photo.png" }))).toBe(Image);
  });

  test("returns Image for .jpg files", () => {
    expect(getNodeIcon(makeNode({ name: "photo.jpg" }))).toBe(Image);
  });

  test("returns FileSpreadsheet for .csv files", () => {
    expect(getNodeIcon(makeNode({ name: "data.csv" }))).toBe(FileSpreadsheet);
  });

  test("returns Table for .parquet files", () => {
    expect(getNodeIcon(makeNode({ name: "data.parquet" }))).toBe(Table);
  });

  test("returns Braces for .json files", () => {
    expect(getNodeIcon(makeNode({ name: "config.json" }))).toBe(Braces);
  });

  test("returns File for unknown extensions", () => {
    expect(getNodeIcon(makeNode({ name: "readme.md" }))).toBe(File);
  });

  test("returns File for files without extension", () => {
    expect(getNodeIcon(makeNode({ name: "Makefile" }))).toBe(File);
  });
});

describe("getTypeLabel", () => {
  test("returns 'Bucket' for bucket nodes", () => {
    expect(getTypeLabel(makeNode({ type: "bucket" }))).toBe("Bucket");
  });

  test("returns 'Folder' for directory nodes", () => {
    expect(getTypeLabel(makeNode({ type: "directory" }))).toBe("Folder");
  });

  test("returns 'OME-TIFF' for .ome.tif files", () => {
    expect(getTypeLabel(makeNode({ name: "sample.ome.tif" }))).toBe("OME-TIFF");
  });

  test("returns 'CSV' for .csv files", () => {
    expect(getTypeLabel(makeNode({ name: "data.csv" }))).toBe("CSV");
  });

  test("returns 'Parquet' for .parquet files", () => {
    expect(getTypeLabel(makeNode({ name: "data.parquet" }))).toBe("Parquet");
  });

  test("returns 'PNG' for .png files", () => {
    expect(getTypeLabel(makeNode({ name: "image.png" }))).toBe("PNG");
  });

  test("returns 'JPEG' for .jpg files", () => {
    expect(getTypeLabel(makeNode({ name: "photo.jpg" }))).toBe("JPEG");
  });

  test("returns 'NDJSON' for .ndjson files", () => {
    expect(getTypeLabel(makeNode({ name: "stream.ndjson" }))).toBe("NDJSON");
  });

  test("returns uppercase extension for unknown types", () => {
    expect(getTypeLabel(makeNode({ name: "readme.md" }))).toBe("MD");
  });

  test("returns 'File' for files without extension", () => {
    expect(getTypeLabel(makeNode({ name: "Makefile" }))).toBe("File");
  });
});
