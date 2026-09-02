import { describe, expect, it } from "vitest";

import { getSidecarKey, isSidecarFilename, parseOwnerFromKey } from "~/utils/sidecarKey";

describe("getSidecarKey (settings)", () => {
  it("derives directory-level settings key for an OME-TIFF", () => {
    expect(getSidecarKey("s3://bucket/data/slide.ome.tif", "settings", "u1")).toBe(
      "s3://bucket/data/settings.u1.json",
    );
  });

  it("derives directory-level settings key for a Zarr", () => {
    expect(getSidecarKey("s3://bucket/data/sub/image.zarr", "settings", "u1")).toBe(
      "s3://bucket/data/sub/settings.u1.json",
    );
  });

  it("derives glob key when userId is omitted (all users)", () => {
    expect(getSidecarKey("s3://bucket/data/slide.ome.tif", "settings")).toBe(
      "s3://bucket/data/settings.*.json",
    );
  });

  it("sibling images share the same settings key", () => {
    const a = getSidecarKey("s3://bucket/data/USL-2022-42.ome.tif", "settings", "u1");
    const b = getSidecarKey("s3://bucket/data/USL-2023-20.ome.tif", "settings", "u1");
    expect(a).toBe(b);
    expect(a).toBe("s3://bucket/data/settings.u1.json");
  });

  it("handles keys without a directory (bucket root)", () => {
    expect(getSidecarKey("s3://bucket/slide.ome.tif", "settings", "u1")).toBe(
      "s3://bucket/settings.u1.json",
    );
  });

  it("handles keys without a path (bare filename)", () => {
    expect(getSidecarKey("slide.ome.tif", "settings", "u1")).toBe("settings.u1.json");
  });
});

describe("parseOwnerFromKey (settings)", () => {
  it("extracts userId from a directory-level settings filename", () => {
    expect(parseOwnerFromKey("s3://bucket/data/settings.u1.json", "settings")).toBe("u1");
  });

  it("extracts userId containing dots (federated IdP subject)", () => {
    expect(parseOwnerFromKey("s3://bucket/data/settings.abc.def.123.json", "settings")).toBe(
      "abc.def.123",
    );
  });

  it("returns undefined for a non-settings filename", () => {
    expect(parseOwnerFromKey("s3://bucket/data/slide.annotations.u1.json", "settings")).toBe(
      undefined,
    );
  });
});

describe("parseOwnerFromKey (annotations)", () => {
  it("extracts userId from an annotations filename", () => {
    expect(parseOwnerFromKey("s3://bucket/data/slide.annotations.u1.json", "annotations")).toBe(
      "u1",
    );
  });

  it("returns undefined for a settings filename when kind is annotations", () => {
    expect(parseOwnerFromKey("s3://bucket/data/settings.u1.json", "annotations")).toBe(undefined);
  });

  it("returns undefined for a plain image filename", () => {
    expect(parseOwnerFromKey("s3://bucket/data/slide.ome.tif", "settings")).toBe(undefined);
    expect(parseOwnerFromKey("s3://bucket/data/slide.ome.tif", "annotations")).toBe(undefined);
  });
});

describe("isSidecarFilename", () => {
  it.each([
    ["slide.ome.annotations.set-uuid.json", true], // arbitrary owner segment (setId or userId)
    ["slide.ome.annotations.43f251e8-5a5a-4a54-96b2-c64cd2ced695.json", true],
    ["settings.u1.json", true],
    ["settings.abc.def.123.json", true], // dotted owner (federated IdP subject)
    ["slide.ome.tif", false],
    ["data.json", false],
    ["slide.annotations.json", false], // no owner segment — not a sidecar
    ["mysettings.u1.json", false], // "settings" must not be embedded in the base
    ["export.geojson", false],
  ])("%s → %s", (name, expected) => {
    expect(isSidecarFilename(name)).toBe(expected);
  });
});
