import { describe, expect, test } from "vitest";

import { getFileCategory, getFileType, getFileTypeEntry } from "../fileType";
import { formatRegistry } from "~/components/ImageViewer/state/formatRegistry";

describe("getFileType", () => {
  test("identifies OME-TIFF files", () => {
    expect(getFileType("image.ome.tiff")).toBe("OME-TIFF");
    expect(getFileType("image.ome.tif")).toBe("OME-TIFF");
    expect(getFileType("IMAGE.OME.TIFF")).toBe("OME-TIFF");
  });

  test("identifies SpatialData files", () => {
    expect(getFileType("dataset.sdata.zarr")).toBe("SpatialData");
    expect(getFileType("dataset.spatialdata.zarr")).toBe("SpatialData");
    expect(getFileType("DATASET.SDATA.ZARR")).toBe("SpatialData");
    expect(getFileType("dataset.sdata.zarr/")).toBe("SpatialData");
    expect(getFileType("Xenium_Protein_HumanKidney_tiny.sdata")).toBe("SpatialData");
    expect(getFileType("MIBI-TOF_CRC.sdata/")).toBe("SpatialData");
    expect(getFileType("DATASET.SDATA")).toBe("SpatialData");
    expect(getFileType("store.spatialdata")).toBe("SpatialData");
  });

  test("does not misclassify .sdata.zip archives as SpatialData stores", () => {
    expect(getFileType("MIBI-TOF_CRC.sdata.zip")).toBe("Unknown");
  });

  test("identifies Parquet files", () => {
    expect(getFileType("data.parquet")).toBe("Parquet");
    expect(getFileType("DATA.PARQUET")).toBe("Parquet");
  });

  test("identifies CSV files", () => {
    expect(getFileType("table.csv")).toBe("CSV");
  });

  test("identifies JSON files", () => {
    expect(getFileType("config.json")).toBe("JSON");
  });

  test("identifies YAML and TXT files", () => {
    expect(getFileType("config.yaml")).toBe("YAML");
    expect(getFileType("config.yml")).toBe("YAML");
    expect(getFileType("notes.txt")).toBe("TXT");
  });

  test("returns Unknown for unrecognized extensions", () => {
    expect(getFileType("photo.png")).toBe("Unknown");
    expect(getFileType("photo.jpg")).toBe("Unknown");
    expect(getFileType("photo.tiff")).toBe("Unknown");
    expect(getFileType("file.xyz")).toBe("Unknown");
    expect(getFileType("notes.doc")).toBe("Unknown");
    expect(getFileType("readme.md")).toBe("Unknown");
  });

  test("identifies PDF files", () => {
    expect(getFileType("report.pdf")).toBe("PDF");
    expect(getFileType("REPORT.PDF")).toBe("PDF");
  });

  test("returns Unknown for empty string", () => {
    expect(getFileType("")).toBe("Unknown");
  });

  test("returns Unknown for files without extension", () => {
    expect(getFileType("Makefile")).toBe("Unknown");
  });
});

describe("getFileCategory", () => {
  test("returns image for OME-TIFF, OME-Zarr and SpatialData", () => {
    expect(getFileCategory("image.ome.tiff")).toBe("image");
    expect(getFileCategory("image.ome.tif")).toBe("image");
    expect(getFileCategory("image.ome.zarr")).toBe("image");
    expect(getFileCategory("image.zarr")).toBe("image");
    expect(getFileCategory("dataset.sdata.zarr")).toBe("image");
    expect(getFileCategory("dataset.spatialdata.zarr")).toBe("image");
    expect(getFileCategory("Xenium_Protein_HumanKidney_tiny.sdata")).toBe("image");
  });

  test("returns tabular for CSV and Parquet", () => {
    expect(getFileCategory("table.csv")).toBe("tabular");
    expect(getFileCategory("data.parquet")).toBe("tabular");
  });

  test("returns text for JSON, YAML, TXT", () => {
    expect(getFileCategory("config.json")).toBe("text");
    expect(getFileCategory("manifest.yaml")).toBe("text");
    expect(getFileCategory("manifest.yml")).toBe("text");
    expect(getFileCategory("notes.txt")).toBe("text");
  });

  test("returns document for PDF", () => {
    expect(getFileCategory("report.pdf")).toBe("document");
  });

  test("returns none for unknown / removed types", () => {
    expect(getFileCategory("photo.png")).toBe("none");
    expect(getFileCategory("photo.tiff")).toBe("none");
    expect(getFileCategory("unknown.xyz")).toBe("none");
    expect(getFileCategory("Makefile")).toBe("none");
  });
});

describe("getFileTypeEntry", () => {
  test("returns the full entry for a known file type", () => {
    const entry = getFileTypeEntry("config.json");
    expect(entry?.type).toBe("JSON");
    expect(entry?.category).toBe("text");
  });

  test("returns undefined for unknown types", () => {
    expect(getFileTypeEntry("file.xyz")).toBeUndefined();
  });

  test("distinguishes SpatialData from plain and OME Zarr", () => {
    expect(getFileType("dataset.sdata.zarr")).toBe("SpatialData");
    expect(getFileType("dataset.sdata")).toBe("SpatialData");
    expect(getFileType("dataset.zarr")).toBe("OME-Zarr");
    expect(getFileType("dataset.ome.zarr")).toBe("OME-Zarr");
    const bare = getFileTypeEntry("Xenium_Protein_HumanKidney_tiny.sdata");
    expect(bare?.storageLayout).toBe("leaf");
    const compound = getFileTypeEntry("dataset.sdata.zarr");
    expect(compound?.storageLayout).toBe("leaf");
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
    expect(getFileCategory("file.xyz")).toBe("image");
  });

  test("uses fileTypeMeta.label and fileTypeMeta.icon when provided", () => {
    formatRegistry.add("vendor-plugin", "abc", {
      load: async () => ({ data: [], metadata: {} as never }),
      fileTypeMeta: { label: "Vendor Format", icon: "Microscope" },
    });
    expect(getFileType("sample.abc")).toBe("Vendor Format");
  });

  test("plugin entries do not shadow built-in OME-TIFF/OME-Zarr (built-ins stay in STATIC_FILE_TYPES)", () => {
    expect(getFileType("image.ome.tif")).toBe("OME-TIFF");
    expect(getFileType("image.zarr")).toBe("OME-Zarr");
  });
});

describe("zarr trailing-slash and compound extensions", () => {
  test("trailing-slash zarr URLs resolve to OME-Zarr", () => {
    expect(getFileType("image.zarr/")).toBe("OME-Zarr");
    expect(getFileType("image.ome.zarr/")).toBe("OME-Zarr");
  });

  test(".ome.tiff resolves to OME-TIFF", () => {
    expect(getFileType("image.ome.tiff")).toBe("OME-TIFF");
  });
});

describe("query-string and fragment handling", () => {
  test("presigned URLs (?sig=...) resolve to the correct type", () => {
    expect(getFileType("image.ome.tif?sig=abc&exp=123")).toBe("OME-TIFF");
    expect(getFileType("data.parquet?range=0-1024")).toBe("Parquet");
  });

  test("URL fragments (#frag) are stripped before matching", () => {
    expect(getFileType("image.ome.tif#region-1")).toBe("OME-TIFF");
  });

  test("getFileCategory honours query-stripped extension", () => {
    expect(getFileCategory("config.json?X-Amz-Signature=abc")).toBe("text");
    expect(getFileCategory("data.csv?range=0-100")).toBe("tabular");
  });
});
