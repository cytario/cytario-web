import { describe, expect, test } from "vitest";

import { getNodeIcon } from "../NodeIcon";
import { TreeNode } from "~/components/DirectoryView/buildDirectoryTree";

function makeNode(overrides: Partial<TreeNode> = {}): TreeNode {
  return {
    id: "test",
    connectionId: "",
    connectionName: "aws-bucket",
    name: "test",
    type: "file",
    pathName: "test",
    children: [],
    ...overrides,
  };
}

describe("getNodeIcon", () => {
  test("returns Archive for bucket nodes", () => {
    expect(getNodeIcon(makeNode({ type: "bucket" }))).toBe("Archive");
  });

  test("returns Folder for directory nodes", () => {
    expect(getNodeIcon(makeNode({ type: "directory" }))).toBe("Folder");
  });

  test("returns Microscope for .ome.tif files", () => {
    expect(getNodeIcon(makeNode({ name: "sample.ome.tif" }))).toBe("Microscope");
  });

  test("returns Microscope for .ome.tiff files", () => {
    expect(getNodeIcon(makeNode({ name: "sample.ome.tiff" }))).toBe("Microscope");
  });

  test("returns Image for .png files", () => {
    expect(getNodeIcon(makeNode({ name: "photo.png" }))).toBe("Image");
  });

  test("returns Image for .jpg files", () => {
    expect(getNodeIcon(makeNode({ name: "photo.jpg" }))).toBe("Image");
  });

  test("returns FileSpreadsheet for .csv files", () => {
    expect(getNodeIcon(makeNode({ name: "data.csv" }))).toBe("FileSpreadsheet");
  });

  test("returns Table for .parquet files", () => {
    expect(getNodeIcon(makeNode({ name: "data.parquet" }))).toBe("Table");
  });

  test("returns Braces for .json files", () => {
    expect(getNodeIcon(makeNode({ name: "config.json" }))).toBe("Braces");
  });

  test("returns File for unknown extensions", () => {
    expect(getNodeIcon(makeNode({ name: "readme.md" }))).toBe("File");
  });

  test("returns File for files without extension", () => {
    expect(getNodeIcon(makeNode({ name: "Makefile" }))).toBe("File");
  });
});
