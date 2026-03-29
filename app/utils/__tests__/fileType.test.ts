import { describe, expect, test } from "vitest";

import { getFileType, getFileTypeIcon, IMAGE_FILE_TYPES } from "../fileType";

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

  test("identifies CZI files", () => {
    expect(getFileType("image.czi")).toBe("CZI");
    expect(getFileType("IMAGE.CZI")).toBe("CZI");
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
    expect(IMAGE_FILE_TYPES.has("CZI")).toBe(true);
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

  test("returns Microscope for CZI", () => {
    expect(getFileTypeIcon("image.czi")).toBe("Microscope");
  });

  test("returns Table for Parquet", () => {
    expect(getFileTypeIcon("data.parquet")).toBe("Table");
  });

  test("returns File for unknown types", () => {
    expect(getFileTypeIcon("unknown.xyz")).toBe("File");
    expect(getFileTypeIcon("")).toBe("File");
  });
});
