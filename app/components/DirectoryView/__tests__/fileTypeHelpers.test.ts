import {
  Archive,
  File,
  FileSpreadsheet,
  Folder,
  Image,
  Microscope,
} from "lucide-react";

import { TreeNode } from "../buildDirectoryTree";
import { getFileIcon, getTypeLabel } from "../fileTypeHelpers";

function makeNode(overrides: Partial<TreeNode> = {}): TreeNode {
  return {
    connectionName: "aws-bucket",
    name: "test",
    type: "file",
    bucketName: "bucket",
    provider: "aws",
    children: [],
    ...overrides,
  };
}

describe("getFileIcon", () => {
  test("returns Archive for bucket nodes", () => {
    expect(getFileIcon(makeNode({ type: "bucket" }))).toBe(Archive);
  });

  test("returns Folder for directory nodes", () => {
    expect(getFileIcon(makeNode({ type: "directory" }))).toBe(Folder);
  });

  test("returns Microscope for .ome.tif files", () => {
    expect(getFileIcon(makeNode({ name: "sample.ome.tif" }))).toBe(Microscope);
  });

  test("returns Microscope for .ome.tiff files", () => {
    expect(getFileIcon(makeNode({ name: "sample.ome.tiff" }))).toBe(
      Microscope,
    );
  });

  test("returns Image for .png files", () => {
    expect(getFileIcon(makeNode({ name: "photo.png" }))).toBe(Image);
  });

  test("returns Image for .jpg files", () => {
    expect(getFileIcon(makeNode({ name: "photo.jpg" }))).toBe(Image);
  });

  test("returns FileSpreadsheet for .csv files", () => {
    expect(getFileIcon(makeNode({ name: "data.csv" }))).toBe(FileSpreadsheet);
  });

  test("returns FileSpreadsheet for .parquet files", () => {
    expect(getFileIcon(makeNode({ name: "data.parquet" }))).toBe(
      FileSpreadsheet,
    );
  });

  test("returns File for unknown extensions", () => {
    expect(getFileIcon(makeNode({ name: "readme.md" }))).toBe(File);
  });

  test("returns File for files without extension", () => {
    expect(getFileIcon(makeNode({ name: "Makefile" }))).toBe(File);
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

  test("returns uppercase extension for unknown types", () => {
    expect(getTypeLabel(makeNode({ name: "readme.md" }))).toBe("MD");
  });

  test("returns 'File' for files without extension", () => {
    expect(getTypeLabel(makeNode({ name: "Makefile" }))).toBe("File");
  });
});
