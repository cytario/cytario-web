import { describe, expect, it } from "vitest";

import { getViewSettingsKey } from "~/utils/sidecarKey";

describe("getViewSettingsKey", () => {
  it("derives cytario/ folder key for an OME-TIFF", () => {
    expect(getViewSettingsKey("s3://bucket/data/slide.ome.tif")).toBe(
      "s3://bucket/data/cytario/slide.omero.json",
    );
  });

  it("derives cytario/ folder key for an OME-TIFF (long extension)", () => {
    expect(getViewSettingsKey("s3://bucket/data/slide.ome.tiff")).toBe(
      "s3://bucket/data/cytario/slide.omero.json",
    );
  });

  it("derives cytario/ folder key for a Zarr", () => {
    expect(getViewSettingsKey("s3://bucket/data/image.zarr")).toBe(
      "s3://bucket/data/cytario/image.omero.json",
    );
  });

  it("derives cytario/ folder key for a plain extension", () => {
    expect(getViewSettingsKey("s3://bucket/data/slide.png")).toBe(
      "s3://bucket/data/cytario/slide.omero.json",
    );
  });

  it("handles keys without a directory", () => {
    expect(getViewSettingsKey("slide.ome.tif")).toBe("cytario/slide.omero.json");
  });

  it("handles keys without an extension", () => {
    expect(getViewSettingsKey("s3://bucket/data/slide")).toBe(
      "s3://bucket/data/cytario/slide.omero.json",
    );
  });
});
