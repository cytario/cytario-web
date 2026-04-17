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

import {
  getFileType,
  getFileTypeIcon,
  getNodeIcon,
  getTypeLabel,
  IMAGE_FILE_TYPES,
} from "../fileType";
import { TreeNode } from "~/components/DirectoryView/buildDirectoryTree";

function makeNode(overrides: Partial<TreeNode> = {}): TreeNode {
  return {
    id: "test",
    connectionName: "aws-bucket",
    name: "test",
    type: "file",
    bucketName: "bucket",
    provider: "aws",
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

describe("IMAGE_FILE_TYPES", () => {
  test("contains all image types", () => {
    expect(IMAGE_FILE_TYPES.has("TIFF")).toBe(true);
    expect(IMAGE_FILE_TYPES.has("OME-TIFF")).toBe(true);
    expect(IMAGE_FILE_TYPES.has("PNG")).toBe(true);
    expect(IMAGE_FILE_TYPES.has("JPEG")).toBe(true);
  });

  test("does not contain non-image types", () => {
    expect(IMAGE_FILE_TYPES.has("CSV")).toBe(false);
    expect(IMAGE_FILE_TYPES.has("Parquet")).toBe(false);
    expect(IMAGE_FILE_TYPES.has("JSON")).toBe(false);
    expect(IMAGE_FILE_TYPES.has("Unknown")).toBe(false);
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
    expect(getNodeIcon(makeNode({ name: "sample.ome.tiff" }))).toBe(
      Microscope,
    );
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
