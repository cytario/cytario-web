import { describe, expect, test } from "vitest";

import { isAnnotationImportFile, parseAnnotationImportFile } from "../annotationImport";

describe("isAnnotationImportFile", () => {
  test.each([
    ["export.json", true],
    ["export.geojson", true],
    ["export.GEOJSON", true], // case-insensitive extension
    ["export.JSON", true],
    ["notes.txt", false],
    ["export.geojson.txt", false],
    ["json", false], // extensionless
    ["image.ome.tif", false],
  ])("%s → %s", (name, expected) => {
    expect(isAnnotationImportFile(new File([], name))).toBe(expected);
  });
});

describe("parseAnnotationImportFile", () => {
  const makeFile = (contents: string, name = "export.geojson") =>
    new File([contents], name, { type: "application/geo+json" });

  test("keeps valid features and drops invalid ones", async () => {
    const contents = JSON.stringify({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          id: "good",
          geometry: { type: "Point", coordinates: [1, 2] },
          properties: {},
        },
        {
          type: "Feature",
          id: "bad",
          geometry: { type: "Point", coordinates: "nope" },
          properties: {},
        },
      ],
    });

    const features = await parseAnnotationImportFile(makeFile(contents));

    expect(features).toHaveLength(1);
    expect(features[0].id).toBe("good");
  });

  test("throws on malformed JSON", async () => {
    await expect(parseAnnotationImportFile(makeFile("{not json"))).rejects.toThrow();
  });

  test("throws when no valid features remain", async () => {
    const contents = JSON.stringify({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          id: "bad",
          geometry: { type: "Point", coordinates: "nope" },
          properties: {},
        },
      ],
    });

    await expect(parseAnnotationImportFile(makeFile(contents))).rejects.toThrow(
      /contains no valid annotation features/,
    );
  });

  test("throws on a feature collection with zero features", async () => {
    const contents = JSON.stringify({ type: "FeatureCollection", features: [] });

    await expect(parseAnnotationImportFile(makeFile(contents))).rejects.toThrow(
      /contains no valid annotation features/,
    );
  });
});
